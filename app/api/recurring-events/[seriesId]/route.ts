import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import type { Entrainement, Plateau } from '@/types/match';
import type { EntrainementEntity, PlateauEntity } from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import { notifyContact } from '@/lib/notifications/service';
import { activeContacts, isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';

async function resolveParams(params: Promise<{ seriesId: string }> | { seriesId: string }) {
  return params instanceof Promise ? params : Promise.resolve(params);
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
    let updated = 0;

    const trainingRepo = db.getRepository<EntrainementEntity>('Entrainement');
    const trainingRows = await trainingRepo.find();
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
      await trainingRepo.save(row);
      await logAuditEntry(db, { user: auth.user, entityType: 'Entrainement', entityId: row.id, action: 'update', before: current as unknown as Record<string, unknown>, after: next as unknown as Record<string, unknown> });
      if (isVisiblePublicationStatus(currentStatus)) {
        await Promise.all(activeContacts(next.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-updated', title: 'Série de planning modifiée', message: `Entraînement du ${next.date} — ${next.time}, ${next.lieu}.`, eventType: 'entrainement', eventId: next.id,
        })));
      }
      updated += 1;
    }

    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');
    const plateauRows = await plateauRepo.find();
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
      await plateauRepo.save(row);
      await logAuditEntry(db, { user: auth.user, entityType: 'Plateau', entityId: row.id, action: 'update', before: current as unknown as Record<string, unknown>, after: next as unknown as Record<string, unknown> });
      if (isVisiblePublicationStatus(currentStatus)) {
        await Promise.all(activeContacts(next.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-updated', title: 'Série de planning modifiée', message: `Plateau du ${next.date} — ${next.time}, ${next.lieu}.`, eventType: 'plateau', eventId: next.id,
        })));
      }
      updated += 1;
    }

    if (!updated) return NextResponse.json({ error: 'Série introuvable' }, { status: 404 });
    return NextResponse.json({ success: true, updated });
  } catch (error) {
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
    let removed = 0;

    const trainingRepo = db.getRepository<EntrainementEntity>('Entrainement');
    for (const row of await trainingRepo.find()) {
      const event = row.payload as unknown as Entrainement;
      if (event.seriesId !== seriesId) continue;
      if (isVisiblePublicationStatus(normalizePlanningStatus(event.planningStatus))) {
        await Promise.all(activeContacts(event.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-cancelled', title: 'Série supprimée', message: `L'entraînement du ${event.date} à ${event.time} a été supprimé.`, eventType: 'entrainement', eventId: event.id,
        })));
      }
      await trainingRepo.remove(row);
      await logAuditEntry(db, { user: auth.user, entityType: 'Entrainement', entityId: row.id, action: 'delete', before: event as unknown as Record<string, unknown>, after: null });
      removed += 1;
    }

    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');
    for (const row of await plateauRepo.find()) {
      const event = row.payload as unknown as Plateau;
      if (event.seriesId !== seriesId) continue;
      if (isVisiblePublicationStatus(normalizePlanningStatus(event.planningStatus))) {
        await Promise.all(activeContacts(event.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'series-cancelled', title: 'Série supprimée', message: `Le plateau du ${event.date} à ${event.time} a été supprimé.`, eventType: 'plateau', eventId: event.id,
        })));
      }
      await plateauRepo.remove(row);
      await logAuditEntry(db, { user: auth.user, entityType: 'Plateau', entityId: row.id, action: 'delete', before: event as unknown as Record<string, unknown>, after: null });
      removed += 1;
    }

    if (!removed) return NextResponse.json({ error: 'Série introuvable' }, { status: 404 });
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    console.error('Error deleting recurring series:', error);
    return NextResponse.json({ error: 'Impossible de supprimer la série' }, { status: 500 });
  }
}
