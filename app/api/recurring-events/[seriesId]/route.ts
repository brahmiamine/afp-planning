import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import type { Entrainement, Plateau } from '@/types/match';
import type { EntrainementEntity, PlateauEntity } from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import { isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';
import { archivePlanningEvent, isPlanningEventCurrentlyPublished } from '@/lib/planning/event-lifecycle';
import { applyPlanningPublicationAction } from '@/lib/planning/publication-service';
import { getPlanningEventSnapshot, PlanningConcurrencyError, type PlanningEventSnapshot } from '@/lib/planning/event-store';
import { setCurrentClubId } from '@/lib/auth/club-context';
import {
  parseEntrainementPayload,
  parsePlateauPayload,
  serializeEntrainementPayload,
  serializePlateauPayload,
} from '@/lib/db/planning-payload-codecs';

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
  setCurrentClubId(auth.user.clubId);

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
      const current = parseEntrainementPayload(row.payload, row.id);
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
      row.payload = serializeEntrainementPayload(next);
      trainingChanges.push({ row, before: current, after: next });
      updated += 1;
    }

    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');
    const plateauRows = await plateauRepo.findBy({ clubId: auth.user.clubId });
    for (const row of plateauRows) {
      const current = parsePlateauPayload(row.payload, row.id);
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
      row.payload = serializePlateauPayload(next);
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
        locked.payload = serializeEntrainementPayload(change.after);
        await trainingTx.save(locked);
      }
      const plateauTx = manager.getRepository<PlateauEntity>('Plateau');
      for (const change of plateauChanges) {
        const locked = await plateauTx.findOne({ where: { id: change.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(change.before)) throw new PlanningConcurrencyError();
        change.after.planningRevision = revisionOf(change.before) + 1;
        locked.time = change.after.time;
        locked.payload = serializePlateauPayload(change.after);
        await plateauTx.save(locked);
      }
    });
    // Une série publiée reste en préparation comme n'importe quel événement modifié
    // (statut `modified` déjà posé ci-dessus) : aucune notification n'est envoyée ici, la
    // prochaine publication globale se charge de rendre le changement visible et de
    // notifier chaque personne concernée une seule fois (issue #200).
    for (const change of trainingChanges) {
      await logAuditEntry(db, { user: auth.user, entityType: 'Entrainement', entityId: change.row.id, action: 'update', before: change.before as unknown as Record<string, unknown>, after: change.after as unknown as Record<string, unknown> });
    }
    for (const change of plateauChanges) {
      await logAuditEntry(db, { user: auth.user, entityType: 'Plateau', entityId: change.row.id, action: 'update', before: change.before as unknown as Record<string, unknown>, after: change.after as unknown as Record<string, unknown> });
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
  setCurrentClubId(auth.user.clubId);

  try {
    const { seriesId } = await resolveParams(params);
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'recurringEvents');
    if (disabled) return disabled;
    const seriesTrainings: Array<{ row: EntrainementEntity; event: Entrainement }> = [];
    const seriesPlateaux: Array<{ row: PlateauEntity; event: Plateau }> = [];

    const trainingRepo = db.getRepository<EntrainementEntity>('Entrainement');
    for (const row of await trainingRepo.findBy({ clubId: auth.user.clubId })) {
      const event = parseEntrainementPayload(row.payload, row.id);
      if (event.seriesId !== seriesId) continue;
      seriesTrainings.push({ row, event });
    }

    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');
    for (const row of await plateauRepo.findBy({ clubId: auth.user.clubId })) {
      const event = parsePlateauPayload(row.payload, row.id);
      if (event.seriesId !== seriesId) continue;
      seriesPlateaux.push({ row, event });
    }

    if (!seriesTrainings.length && !seriesPlateaux.length) {
      return NextResponse.json({ error: 'Série introuvable' }, { status: 404 });
    }

    // Un événement déjà publié reste inchangé dans le snapshot visible aux utilisateurs :
    // sa suppression est préparée comme une annulation de brouillon (statut `cancelled`,
    // sans notification immédiate), exactement comme la suppression d'un événement isolé
    // déjà publié. Seuls les événements jamais publiés peuvent être supprimés tout de suite
    // (issue #200).
    const draftTrainings: typeof seriesTrainings = [];
    const publishedTrainings: Array<{ row: EntrainementEntity; snapshot: PlanningEventSnapshot }> = [];
    for (const item of seriesTrainings) {
      const alreadyPublished = await isPlanningEventCurrentlyPublished(db, auth.user.clubId, 'entrainement', item.row.id);
      const snapshot = alreadyPublished ? await getPlanningEventSnapshot(db, 'entrainement', item.row.id) : null;
      if (snapshot) publishedTrainings.push({ row: item.row, snapshot });
      else draftTrainings.push(item);
    }

    const draftPlateaux: typeof seriesPlateaux = [];
    const publishedPlateaux: Array<{ row: PlateauEntity; snapshot: PlanningEventSnapshot }> = [];
    for (const item of seriesPlateaux) {
      const alreadyPublished = await isPlanningEventCurrentlyPublished(db, auth.user.clubId, 'plateau', item.row.id);
      const snapshot = alreadyPublished ? await getPlanningEventSnapshot(db, 'plateau', item.row.id) : null;
      if (snapshot) publishedPlateaux.push({ row: item.row, snapshot });
      else draftPlateaux.push(item);
    }

    await db.transaction(async (manager) => {
      const trainingTx = manager.getRepository<EntrainementEntity>('Entrainement');
      for (const item of draftTrainings) {
        const locked = await trainingTx.findOne({ where: { id: item.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(item.event)) throw new PlanningConcurrencyError();
        await trainingTx.remove(locked);
      }
      const plateauTx = manager.getRepository<PlateauEntity>('Plateau');
      for (const item of draftPlateaux) {
        const locked = await plateauTx.findOne({ where: { id: item.row.id, clubId: auth.user.clubId }, lock: { mode: 'pessimistic_write' } });
        if (!locked || revisionOf(locked.payload) !== revisionOf(item.event)) throw new PlanningConcurrencyError();
        await plateauTx.remove(locked);
      }
    });
    for (const { row, event } of draftTrainings) {
      await archivePlanningEvent(db, 'entrainement', row.id, auth.user.id, auth.user.clubId);
      await logAuditEntry(db, { user: auth.user, entityType: 'Entrainement', entityId: row.id, action: 'delete', before: event as unknown as Record<string, unknown>, after: null });
    }
    for (const { row, event } of draftPlateaux) {
      await archivePlanningEvent(db, 'plateau', row.id, auth.user.id, auth.user.clubId);
      await logAuditEntry(db, { user: auth.user, entityType: 'Plateau', entityId: row.id, action: 'delete', before: event as unknown as Record<string, unknown>, after: null });
    }

    // applyPlanningPublicationAction journalise déjà l'annulation elle-même
    // (entityType PlanningPublication) : pas de double audit ici, comme pour la
    // suppression différée d'un événement isolé déjà publié.
    for (const { snapshot } of publishedTrainings) {
      await applyPlanningPublicationAction(db, auth.user, snapshot, 'cancel', 'Suppression de série préparée depuis le planning');
    }
    for (const { snapshot } of publishedPlateaux) {
      await applyPlanningPublicationAction(db, auth.user, snapshot, 'cancel', 'Suppression de série préparée depuis le planning');
    }

    return NextResponse.json({
      success: true,
      removed: draftTrainings.length + draftPlateaux.length,
      deferred: publishedTrainings.length + publishedPlateaux.length,
    });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error deleting recurring series:', error);
    return NextResponse.json({ error: 'Impossible de supprimer la série' }, { status: 500 });
  }
}
