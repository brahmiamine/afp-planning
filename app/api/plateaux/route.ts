import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PlateauxData, Plateau } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import { enrichAssignmentContacts } from '@/lib/planning/assignment-contacts';
import { propagateAssignmentChangesIfPublished } from '@/lib/planning/assignment-propagation';
import { isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { archivePlanningEvent, isPlanningEventCurrentlyPublished } from '@/lib/planning/event-lifecycle';
import { applyPlanningPublicationAction } from '@/lib/planning/publication-service';
import { getPlanningEventSnapshot, PlanningConcurrencyError, saveBasePlanningEventOptimistically } from '@/lib/planning/event-store';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { parsePlateauPayload, serializePlateauPayload } from '@/lib/db/planning-payload-codecs';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const rows = await db.getRepository('Plateau').findBy({ clubId: auth.user.clubId });
    const plateaux = rows
      .map((row) => parsePlateauPayload(row.payload, row.id))
      .filter((item) => Boolean(item?.id));
    const data: PlateauxData = { plateaux: groupMatchesByDate(plateaux) };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading plateaux from DB:', error);
    return NextResponse.json({ error: 'Failed to load plateaux' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const input: Omit<Plateau, 'id'> = await request.json();
    const id = `plateau-${input.date.replace(/\//g, '-')}-${input.time.replace(':', '-')}-${Date.now()}`;
    const db = await getDb();
    const newPlateau: Plateau = {
      ...input,
      id,
      type: 'plateau',
      durationMinutes: input.durationMinutes ?? 120,
      planningStatus: 'draft',
      encadrants: await enrichAssignmentContacts(db, auth.user.clubId, input.encadrants, 'encadrant'),
    };
    await db.getRepository('Plateau').save({
      id,
      clubId: auth.user.clubId,
      date: newPlateau.date,
      time: newPlateau.time,
      payload: serializePlateauPayload(newPlateau),
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'create',
      before: null,
      after: newPlateau as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, plateau: newPlateau });
  } catch (error) {
    console.error('Error saving plateau:', error);
    return NextResponse.json({ error: 'Failed to save plateau' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const { id, date, ...updatedPlateau } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!row) return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });

    const currentPayload = parsePlateauPayload(row.payload, id);
    const currentStatus = normalizePlanningStatus(currentPayload.planningStatus);
    const scheduleChanged = currentPayload.date !== (date || currentPayload.date)
      || currentPayload.time !== (updatedPlateau.time ?? currentPayload.time)
      || currentPayload.lieu !== (updatedPlateau.lieu ?? currentPayload.lieu);
    const nextStatus = scheduleChanged && isVisiblePublicationStatus(currentStatus) ? 'modified' : currentStatus;

    const nextPayload: Plateau = {
      ...currentPayload,
      ...updatedPlateau,
      id,
      date: date || currentPayload.date,
      type: 'plateau',
      planningStatus: nextStatus,
      ...(nextStatus === 'modified' ? { modifiedAfterPublishAt: new Date().toISOString() } : {}),
      durationMinutes: typeof updatedPlateau.durationMinutes === 'number'
        ? updatedPlateau.durationMinutes
        : currentPayload.durationMinutes ?? 120,
      encadrants: await enrichAssignmentContacts(
        db,
        auth.user.clubId,
        updatedPlateau.encadrants ?? currentPayload.encadrants,
        'encadrant',
        currentPayload.encadrants,
      ),
    };
    const savedPayload = await saveBasePlanningEventOptimistically(
      db, 'plateau', id, nextPayload, currentPayload.planningRevision ?? 0,
    );

    // Si l'événement est déjà publié, ce changement d'affectation marque l'événement
    // `modified` et attend la prochaine publication globale comme tout autre changement
    // de préparation (issue #197) ; sinon rien à signaler avant la première publication.
    const liveSnapshot = await getPlanningEventSnapshot(db, 'plateau', id);
    if (liveSnapshot) {
      await propagateAssignmentChangesIfPublished(
        db, auth.user.clubId, liveSnapshot,
        currentPayload.encadrants, savedPayload.encadrants,
      );
    }

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: savedPayload as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, plateau: savedPayload });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error updating plateau:', error);
    return NextResponse.json({ error: 'Failed to update plateau' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!row) return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });

    const payload = parsePlateauPayload(row.payload, id);
    const snapshot = await getPlanningEventSnapshot(db, 'plateau', id);
    const alreadyPublished = await isPlanningEventCurrentlyPublished(
      db,
      auth.user.clubId,
      'plateau',
      id,
    );

    // Un événement déjà communiqué reste inchangé dans le snapshot visible aux utilisateurs.
    // Le DELETE prépare uniquement son annulation dans le brouillon ; la publication globale
    // propagera ensuite l'annulation et les notifications de façon cohérente.
    if (alreadyPublished && snapshot) {
      const planningStatus = await applyPlanningPublicationAction(
        db,
        auth.user,
        snapshot,
        'cancel',
        'Suppression préparée depuis le planning',
      );
      return NextResponse.json({ success: true, deferred: true, planningStatus });
    }

    await archivePlanningEvent(db, 'plateau', id, auth.user.id, auth.user.clubId);
    await repo.remove(row);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'delete',
      before: payload as unknown as Record<string, unknown>,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plateau:', error);
    return NextResponse.json({ error: 'Failed to delete plateau' }, { status: 500 });
  }
}
