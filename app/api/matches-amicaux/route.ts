import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MatchesAmicauxData, Match, type AssignmentContact } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { notifyContact } from '@/lib/notifications/service';

async function contactsForMatch(id: string): Promise<AssignmentContact[]> {
  const db = await getDb();
  const row = await db.getRepository('MatchExtra').findOneBy({ matchId: id });
  const extras = row?.payload as unknown as MatchExtras | undefined;
  return [
    ...(extras?.arbitreTouche ?? []),
    ...(extras?.contactEncadrants ?? []),
    ...(extras?.contactAccompagnateur ?? []),
  ];
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const rows = await db.getRepository('MatchAmical').find();
    const matches = rows
      .map((row) => row.payload as unknown as Match)
      .filter((item) => Boolean(item?.id));
    const matchesData: MatchesAmicauxData = { matches: groupMatchesByDate(matches) };
    return NextResponse.json(matchesData);
  } catch (error) {
    console.error('Error reading matches amicaux from DB:', error);
    return NextResponse.json({ error: 'Failed to load matches amicaux' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const match: Match = await request.json();
    if (!match.id) {
      match.id = `amical-${match.date.replace(/\//g, '-')}-${match.time.replace(':', '-')}-${Date.now()}`;
    }
    match.type = 'amical';
    match.durationMinutes = match.durationMinutes ?? 90;

    const db = await getDb();
    await db.getRepository('MatchAmical').save({
      id: match.id,
      date: match.date,
      time: match.time || '',
      payload: match as unknown as Record<string, unknown>,
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: match.id,
      action: 'create',
      before: null,
      after: match as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, match });
  } catch (error) {
    console.error('Error saving match amical:', error);
    return NextResponse.json({ error: 'Failed to save match amical' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const { id, date, ...updatedMatch } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const currentPayload = row.payload as unknown as Match;
    const nextPayload: Match = {
      ...currentPayload,
      ...updatedMatch,
      id,
      date: date || currentPayload.date,
      type: 'amical',
      durationMinutes: typeof updatedMatch.durationMinutes === 'number'
        ? updatedMatch.durationMinutes
        : currentPayload.durationMinutes ?? 90,
    };

    await repo.save({
      id,
      date: nextPayload.date,
      time: nextPayload.time || '',
      payload: nextPayload as unknown as Record<string, unknown>,
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: nextPayload as unknown as Record<string, unknown>,
    });

    const scheduleChanged = currentPayload.date !== nextPayload.date
      || currentPayload.time !== nextPayload.time
      || currentPayload.details?.stadium !== nextPayload.details?.stadium;
    if (scheduleChanged) {
      const contacts = await contactsForMatch(id);
      await Promise.all(contacts.map((contact) => notifyContact(db, contact, {
        type: 'event-updated',
        title: 'Planning modifié',
        message: `${nextPayload.localTeam} – ${nextPayload.awayTeam} : ${nextPayload.date} à ${nextPayload.time}${nextPayload.details?.stadium ? `, ${nextPayload.details.stadium}` : ''}.`,
        eventType: 'amical',
        eventId: id,
      })));
    }

    return NextResponse.json({ success: true, match: nextPayload });
  } catch (error) {
    console.error('Error updating match amical:', error);
    return NextResponse.json({ error: 'Failed to update match amical' }, { status: 500 });
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
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id });
    if (!row) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const payload = row.payload as unknown as Match;
    const contacts = await contactsForMatch(id);
    await Promise.all(contacts.map((contact) => notifyContact(db, contact, {
      type: 'event-cancelled',
      title: 'Match supprimé',
      message: `${payload.localTeam} – ${payload.awayTeam} du ${payload.date} à ${payload.time} a été supprimé.`,
      eventType: 'amical',
      eventId: id,
    })));

    await repo.remove(row);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: id,
      action: 'delete',
      before: payload as unknown as Record<string, unknown>,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match amical:', error);
    return NextResponse.json({ error: 'Failed to delete match amical' }, { status: 500 });
  }
}
