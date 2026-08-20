import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { EntrainementsData, Entrainement } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import { enrichAssignmentContacts, notifyAssignmentChanges } from '@/lib/planning/assignment-contacts';
import { notifyContact } from '@/lib/notifications/service';
import { activeContacts, isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const rows = await db.getRepository('Entrainement').find();
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
      encadrants: await enrichAssignmentContacts(db, input.encadrants, 'encadrant'),
    };

    await db.getRepository('Entrainement').save({
      id,
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

  try {
    const { id, date, ...updatedEntrainement } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    const row = await repo.findOneBy({ id });
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
        updatedEntrainement.encadrants ?? currentPayload.encadrants,
        'encadrant',
        currentPayload.encadrants,
      ),
    };

    await repo.save({
      id,
      date: nextPayload.date,
      time: nextPayload.time,
      payload: nextPayload as unknown as Record<string, unknown>,
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Entrainement',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: nextPayload as unknown as Record<string, unknown>,
    });

    if (isVisiblePublicationStatus(currentStatus)) {
      await notifyAssignmentChanges(db, currentPayload.encadrants, nextPayload.encadrants, {
        eventType: 'entrainement',
        eventId: id,
        roleLabel: 'Encadrant',
        eventLabel: nextPayload.categorie ? `Entraînement ${nextPayload.categorie}` : 'Entraînement',
        date: nextPayload.date,
        time: nextPayload.time,
      });

      if (scheduleChanged) {
        await Promise.all(activeContacts(nextPayload.encadrants).map((contact) => notifyContact(db, contact, {
          type: 'event-updated',
          title: 'Planning modifié',
          message: `Entraînement déplacé/modifié — ${nextPayload.date} à ${nextPayload.time}, ${nextPayload.lieu}.`,
          eventType: 'entrainement',
          eventId: id,
        })));
      }
    }

    return NextResponse.json({ success: true, entrainement: nextPayload });
  } catch (error) {
    console.error('Error updating entrainement:', error);
    return NextResponse.json({ error: 'Failed to update entrainement' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });

    const payload = row.payload as unknown as Entrainement;
    if (isVisiblePublicationStatus(normalizePlanningStatus(payload.planningStatus))) {
      await Promise.all(activeContacts(payload.encadrants).map((contact) => notifyContact(db, contact, {
        type: 'event-cancelled',
        title: 'Événement supprimé',
        message: `L'entraînement du ${payload.date} à ${payload.time} a été supprimé.`,
        eventType: 'entrainement',
        eventId: id,
      })));
    }

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
