import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PlateauxData, Plateau } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import { enrichAssignmentContacts, notifyAssignmentChanges } from '@/lib/planning/assignment-contacts';
import { notifyContact } from '@/lib/notifications/service';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const rows = await db.getRepository('Plateau').find();
    const plateaux = rows
      .map((row) => row.payload as unknown as Plateau)
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

  try {
    const input: Omit<Plateau, 'id'> = await request.json();
    const id = `plateau-${input.date.replace(/\//g, '-')}-${input.time.replace(':', '-')}-${Date.now()}`;
    const db = await getDb();
    const newPlateau: Plateau = {
      ...input,
      id,
      type: 'plateau',
      durationMinutes: input.durationMinutes ?? 120,
      encadrants: await enrichAssignmentContacts(db, input.encadrants, 'encadrant'),
    };

    await db.getRepository('Plateau').save({
      id,
      date: newPlateau.date,
      time: newPlateau.time,
      payload: newPlateau as unknown as Record<string, unknown>,
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'Plateau',
      entityId: id,
      action: 'create',
      before: null,
      after: newPlateau as unknown as Record<string, unknown>,
    });

    await notifyAssignmentChanges(db, [], newPlateau.encadrants, {
      eventType: 'plateau',
      eventId: id,
      roleLabel: 'Encadrant',
      eventLabel: newPlateau.categories?.length ? `Plateau ${newPlateau.categories.join(', ')}` : 'Plateau',
      date: newPlateau.date,
      time: newPlateau.time,
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

  try {
    const { id, date, ...updatedPlateau } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });

    const currentPayload = row.payload as unknown as Plateau;
    const nextPayload: Plateau = {
      ...currentPayload,
      ...updatedPlateau,
      id,
      date: date || currentPayload.date,
      type: 'plateau',
      durationMinutes: typeof updatedPlateau.durationMinutes === 'number'
        ? updatedPlateau.durationMinutes
        : currentPayload.durationMinutes ?? 120,
      encadrants: await enrichAssignmentContacts(
        db,
        updatedPlateau.encadrants ?? currentPayload.encadrants,
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
      entityType: 'Plateau',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: nextPayload as unknown as Record<string, unknown>,
    });

    await notifyAssignmentChanges(db, currentPayload.encadrants, nextPayload.encadrants, {
      eventType: 'plateau',
      eventId: id,
      roleLabel: 'Encadrant',
      eventLabel: nextPayload.categories?.length ? `Plateau ${nextPayload.categories.join(', ')}` : 'Plateau',
      date: nextPayload.date,
      time: nextPayload.time,
    });

    const scheduleChanged = currentPayload.date !== nextPayload.date
      || currentPayload.time !== nextPayload.time
      || currentPayload.lieu !== nextPayload.lieu;
    if (scheduleChanged) {
      await Promise.all((nextPayload.encadrants ?? []).map((contact) => notifyContact(db, contact, {
        type: 'event-updated',
        title: 'Planning modifié',
        message: `Plateau déplacé/modifié — ${nextPayload.date} à ${nextPayload.time}, ${nextPayload.lieu}.`,
        eventType: 'plateau',
        eventId: id,
      })));
    }

    return NextResponse.json({ success: true, plateau: nextPayload });
  } catch (error) {
    console.error('Error updating plateau:', error);
    return NextResponse.json({ error: 'Failed to update plateau' }, { status: 500 });
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
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });

    const payload = row.payload as unknown as Plateau;
    await Promise.all((payload.encadrants ?? []).map((contact) => notifyContact(db, contact, {
      type: 'event-cancelled',
      title: 'Événement supprimé',
      message: `Le plateau du ${payload.date} à ${payload.time} a été supprimé.`,
      eventType: 'plateau',
      eventId: id,
    })));

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
