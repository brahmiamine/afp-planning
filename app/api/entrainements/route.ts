import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { EntrainementsData, Entrainement } from '@/types/match';
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

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const rows = await db.getRepository('Entrainement').findBy({ clubId: auth.user.clubId });
    const entrainements = rows
      .map((row) => row.payload as unknown as Entrainement)
      .filter((item) => Boolean(item?.id));
    const data: EntrainementsData = { entrainements: groupMatchesByDate(entrainements) };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading entrainements from DB:', error);
    return NextResponse.json({ error: 'Failed to load entrainements' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const input: Omit<Entrainement, 'id'> = await request.json();
    const id = `entrainement-${input.date.replace(/\//g, '-')}-${input.time.replace(':', '-')}-${Date.now()}`;
    const db = await getDb();
    const newEntrainement: Entrainement = {
      ...input,
      id,
      type: 'entrainement',
      durationMinutes: input.durationMinutes ?? 90,
      planningStatus: 'draft',
      encadrants: await enrichAssignmentContacts(db, auth.user.clubId, input.encadrants, 'encadrant'),
    };
    await db.getRepository('Entrainement').save({
      id,
      clubId: auth.user.clubId,
      date: newEntrainement.date,
      time: newEntrainement.time,
      payload: newEntrainement as unknown as Record<string, unknown>,
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Entrainement',
      entityId: id,
      action: 'create',
      before: null,
      after: newEntrainement as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, entrainement: newEntrainement });
  } catch (error) {
    console.error('Error saving entrainement:', error);
    return NextResponse.json({ error: 'Failed to save entrainement' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const { id, date, ...updatedEntrainement } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!row) return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });

    const currentPayload = row.payload as unknown as Entrainement;
    const currentStatus = normalizePlanningStatus(currentPayload.planningStatus);
    const scheduleChanged = currentPayload.date !== (date || currentPayload.date)
      || currentPayload.time !== (updatedEntrainement.time ?? currentPayload.time)
      || currentPayload.lieu !== (updatedEntrainement.lieu ?? currentPayload.lieu);
    const nextStatus = scheduleChanged && isVisiblePublicationStatus(currentStatus) ? 'modified' : currentStatus;

    const nextPayload: Entrainement = {
      ...currentPayload,
      ...updatedEntrainement,
      id,
      date: date || currentPayload.date,
      type: 'entrainement',
      planningStatus: nextStatus,
      ...(nextStatus === 'modified' ? { modifiedAfterPublishAt: new Date().toISOString() } : {}),
      durationMinutes: typeof updatedEntrainement.durationMinutes === 'number'
        ? updatedEntrainement.durationMinutes
        : currentPayload.durationMinutes ?? 90,
      encadrants: await enrichAssignmentContacts(
        db,
        auth.user.clubId,
        updatedEntrainement.encadrants ?? currentPayload.encadrants,
        'encadrant',
        currentPayload.encadrants,
      ),
    };
    const savedPayload = await saveBasePlanningEventOptimistically(
      db, 'entrainement', id, nextPayload, currentPayload.planningRevision ?? 0,
    );

    // Si l'événement est déjà publié, la nouvelle affectation doit être visible et
    // notifiée immédiatement (issue #161) ; sinon elle attend la première publication.
    const liveSnapshot = await getPlanningEventSnapshot(db, 'entrainement', id);
    if (liveSnapshot) {
      await propagateAssignmentChangesIfPublished(
        db, auth.user.clubId, liveSnapshot, 'encadrant',
        currentPayload.encadrants, savedPayload.encadrants,
      );
    }

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Entrainement',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: savedPayload as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, entrainement: savedPayload });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error updating entrainement:', error);
    return NextResponse.json({ error: 'Failed to update entrainement' }, { status: 500 });
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
    const repo = db.getRepository('Entrainement');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!row) return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });

    const payload = row.payload as unknown as Entrainement;
    const snapshot = await getPlanningEventSnapshot(db, 'entrainement', id);
    const alreadyPublished = await isPlanningEventCurrentlyPublished(
      db,
      auth.user.clubId,
      'entrainement',
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

    await archivePlanningEvent(db, 'entrainement', id, auth.user.id, auth.user.clubId);
    await repo.remove(row);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Entrainement',
      entityId: id,
      action: 'delete',
      before: payload as unknown as Record<string, unknown>,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting entrainement:', error);
    return NextResponse.json({ error: 'Failed to delete entrainement' }, { status: 500 });
  }
}
