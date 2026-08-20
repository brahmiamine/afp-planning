import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import type { Entrainement, Plateau } from '@/types/match';
import type { EntrainementEntity, PlateauEntity } from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import { notifyContact } from '@/lib/notifications/service';
import { activeContacts, isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';
import { archivePlanningEvent } from '@/lib/planning/event-lifecycle';
import { PlanningConcurrencyError } from '@/lib/planning/event-store';

async function resolveParams(params: Promise<{ seriesId: string }> | { seriesId: string }) {
  return params instanceof Promise ? params : Promise.resolve(params);
}

function revisionOf(payload: Entrainement | Plateau | Record<string, unknown>): number {
  const revision = payload.planningRevision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> | { seriesId: string } },
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { seriesId } = await resolveParams(params);
    const body = await request.json();
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'recurringEvents');
    if (disabled) return disabled;
    let updated = 0;
    const trainingChanges: Array<{ row: EntrainementEntity; before: Entrainement; after: Entrainement }> = [];
    const plateauChanges: Array<{ row: PlateauEntity; before: Plateau; after: Plateau }> = [];

    const trainingRepo = db.getRepository<EntrainementEntity>('Entrainement');
    const trainingRows = await trainingRepo.findBy({ clubId: auth.user.clubId });
    for (const row of trainingRows) {
      const current = row.payload as unknown as Entrainement;
      if (current.seriesId !== seriesId) continue;
      const currentStatus = normalizePlanningStatus(current.planningStatus);
      const next: Entrainement = {
        ...current,
        time: typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : current.time,
        lieu: typeof body.lieu === 'string' && body.lieu.trim() ? body.lieu.trim() : current.lieu,
        durationMinutes: Number.isFinite(body.durationMinutes) ? Math.min(720, Math.max(15, Math.round(body.durationMinutes))) : current.durationMinutes,
        categorie: typeof body.categorie === 'string' ? body.categorie.trim() || undefined : current.categorie,
        planningStatus: isVisiblePublicationStatus(currentStatus) ? 'modified' : currentStatus,
        ...(isVisiblePublicationStatus(currentStatus) ? { modifiedAfterPublishAt: new Date().toISOString() } : {}),
      };
      row.time = next.time;
      row.payload = next as unknown as Record<string, unknown>;
      trainingChanges.push({ row, before: current, after: next });
      updated += 1;
    }

    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');
    const plateauRows = await plateauRepo.findBy({ clubId: auth.user.clubId });
    for (const row of plateauRows) {
      const current = row.payload as unknown as Plateau;
      if (current.seriesId !== seriesId) continue;
      const currentStatus = normalizePlanningStatus(current.planningStatus);
      const categories = Array.isArray(body.categories)
        ? body.categories.filter((value: unknown): value is string => typeof value === 'string' && value.trim() !== '').map((value: string) => value.trim())
        : current.categories;
      const next: Plateau = {
        ...current,
        time: typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : current.time,
        lieu: typeof body.lieu === 'string' && body.lieu.trim() ? body.lieu.trim() : current.lieu,
        durationMinutes: Number.isFinite(body.durationMinutes) ? Math.min(720, Math.max(15, Math.round(body.durationMinutes))) : current.durationMinutes,
        categories,
        planningStatus: isVisiblePublicationStatus(currentStatus) ? 'modified' : currentStatus,
        ...(isVisiblePublicationStatus(currentStatus) ? { modifiedAfterPublishAt: new Date().toISOString() } : {}),
      };
      row.time = next.time;
      row.payload = next as unknown as Record<string, unknown>;
      plateauChanges.push({ row, before: current, after: next });
      updated += 1;
    }

    if (!updated) return NextResponse.json({ error: 'Série introuvable' }, { status: 404 });
    await db.transaction(async (manager) => {
      const trainingTx = manager.getRepository<EntrainementEntity>('Entrainement');
      for (const change of trainingChanges) {
        const locked = await trainingTx.findOne({ where: { id: change.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(change.before)) throw new PlanningConcurrencyError();
        change.after.planningRevision = revisionOf(change.before) + 1;
        locked.time = change.after.time;
        locked.payload = change.after as unknown as Record<string, unknown>;
        await trainingTx.save(locked);
      }
      const plateauTx = manager.getRepository<PlateauEntity>('Plateau');
      for (const change of plateauChanges) {
        const locked = await plateauTx.findOne({ where: { id: change.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(change.before)) throw new PlanningConcurrencyError();
        change.after.planningRevision = revisionOf(change.before) + 1;
        locked.time = change.after.time;
        locked.payload = change.after as unknown as Record<string, unknown>;
        await plateauTx.save(locked);
      }
    });
    for (const change of trainingChanges) {
      await logAuditEntry(db, { user: auth.user, entityType: 'Entrainement', entityId: change.row.id, action: 'update', before: change.before as unknown as Record<string, unknown>, after: change.after as unknown as Record<string, unknown> });
      if (isVisiblePublicationStatus(normalizePlanningStatus(change.before.planningStatus))) {
        await Promise.all(activeContacts(change.after.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-updated', title: 'Série de planning modifiée', message: `Entraînement du ${change.after.date} — ${change.after.time}, ${change.after.lieu}.`, eventType: 'entrainement', eventId: change.after.id,
        })));
      }
    }
    for (const change of plateauChanges) {
      await logAuditEntry(db, { user: auth.user, entityType: 'Plateau', entityId: change.row.id, action: 'update', before: change.before as unknown as Record<string, unknown>, after: change.after as unknown as Record<string, unknown> });
      if (isVisiblePublicationStatus(normalizePlanningStatus(change.before.planningStatus))) {
        await Promise.all(activeContacts(change.after.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-updated', title: 'Série de planning modifiée', message: `Plateau du ${change.after.date} — ${change.after.time}, ${change.after.lieu}.`, eventType: 'plateau', eventId: change.after.id,
        })));
      }
    }
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error updating recurring series:', error);
    return NextResponse.json({ error: 'Impossible de modifier la série' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> | { seriesId: string } },
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { seriesId } = await resolveParams(params);
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'recurringEvents');
    if (disabled) return disabled;
    let removed = 0;
    const removedTrainings: Array<{ row: EntrainementEntity; event: Entrainement }> = [];
    const removedPlateaux: Array<{ row: PlateauEntity; event: Plateau }> = [];

    const trainingRepo = db.getRepository<EntrainementEntity>('Entrainement');
    for (const row of await trainingRepo.findBy({ clubId: auth.user.clubId })) {
      const event = row.payload as unknown as Entrainement;
      if (event.seriesId !== seriesId) continue;
      removedTrainings.push({ row, event });
      removed += 1;
    }

    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');
    for (const row of await plateauRepo.findBy({ clubId: auth.user.clubId })) {
      const event = row.payload as unknown as Plateau;
      if (event.seriesId !== seriesId) continue;
      removedPlateaux.push({ row, event });
      removed += 1;
    }

    if (!removed) return NextResponse.json({ error: 'Série introuvable' }, { status: 404 });
    await db.transaction(async (manager) => {
      const trainingTx = manager.getRepository<EntrainementEntity>('Entrainement');
      for (const item of removedTrainings) {
        const locked = await trainingTx.findOne({ where: { id: item.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(item.event)) throw new PlanningConcurrencyError();
        await trainingTx.remove(locked);
      }
      const plateauTx = manager.getRepository<PlateauEntity>('Plateau');
      for (const item of removedPlateaux) {
        const locked = await plateauTx.findOne({ where: { id: item.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(item.event)) throw new PlanningConcurrencyError();
        await plateauTx.remove(locked);
      }
    });
    for (const { row, event } of removedTrainings) {
      await archivePlanningEvent(db, 'entrainement', row.id, auth.user.id, auth.user.clubId);
      await logAuditEntry(db, { user: auth.user, entityType: 'Entrainement', entityId: row.id, action: 'delete', before: event as unknown as Record<string, unknown>, after: null });
      if (isVisiblePublicationStatus(normalizePlanningStatus(event.planningStatus))) {
        await Promise.all(activeContacts(event.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-cancelled', title: 'Série supprimée', message: `L'entraînement du ${event.date} à ${event.time} a été supprimé.`, eventType: 'entrainement', eventId: event.id,
        })));
      }
    }
    for (const { row, event } of removedPlateaux) {
      await archivePlanningEvent(db, 'plateau', row.id, auth.user.id, auth.user.clubId);
      await logAuditEntry(db, { user: auth.user, entityType: 'Plateau', entityId: row.id, action: 'delete', before: event as unknown as Record<string, unknown>, after: null });
      if (isVisiblePublicationStatus(normalizePlanningStatus(event.planningStatus))) {
        await Promise.all(activeContacts(event.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-cancelled', title: 'Série supprimée', message: `Le plateau du ${event.date} à ${event.time} a été supprimé.`, eventType: 'plateau', eventId: event.id,
        })));
      }
    }
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error deleting recurring series:', error);
    return NextResponse.json({ error: 'Impossible de supprimer la série' }, { status: 500 });
  }
}
