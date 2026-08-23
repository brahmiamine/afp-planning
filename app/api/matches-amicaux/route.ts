import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MatchesAmicauxData, Match, type AssignmentContact } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { notifyContact } from '@/lib/notifications/service';
import { activeContacts, isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { archivePlanningEvent } from '@/lib/planning/event-lifecycle';
import {
  PlanningConcurrencyError,
  saveBasePlanningEventOptimistically,
  saveMatchExtrasOptimistically,
} from '@/lib/planning/event-store';
import { setCurrentClubId } from '@/lib/auth/club-context';

async function getMatchExtras(id: string): Promise<MatchExtras | null> {
  const db = await getDb();
  const row = await db.getRepository('MatchExtra').findOneBy({ matchId: id });
  return row ? (row.payload as unknown as MatchExtras) : null;
}

async function contactsForMatch(id: string): Promise<AssignmentContact[]> {
  const extras = await getMatchExtras(id);
  return activeContacts([
    ...(extras?.arbitreTouche ?? []),
    ...(extras?.contactEncadrants ?? []),
    ...(extras?.contactAccompagnateur ?? []),
  ]);
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const rows = await db.getRepository('MatchAmical').findBy({ clubId: auth.user.clubId });
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
  setCurrentClubId(auth.user.clubId);

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
      clubId: auth.user.clubId,
      date: match.date,
      time: match.time || '',
      payload: match as unknown as Record<string, unknown>,
    });
    await db.getRepository('MatchExtra').save({
      matchId: match.id,
      clubId: auth.user.clubId,
      payload: { id: match.id, planningStatus: 'draft' },
    });

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: match.id,
      action: 'create',
      before: null,
      after: { ...(match as unknown as Record<string, unknown>), planningStatus: 'draft' },
    });

    return NextResponse.json({ success: true, match, planningStatus: 'draft' });
  } catch (error) {
    console.error('Error saving match amical:', error);
    return NextResponse.json({ error: 'Failed to save matches amicaux' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const { id, date, ...updatedMatch } = await request.json();
    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
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

    const savedPayload = await saveBasePlanningEventOptimistically(
      db, 'amical', id, nextPayload, currentPayload.planningRevision ?? 0,
    );

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'MatchAmical',
      entityId: id,
      action: 'update',
      before: currentPayload as unknown as Record<string, unknown>,
      after: savedPayload as unknown as Record<string, unknown>,
    });

    const scheduleChanged = currentPayload.date !== nextPayload.date
      || currentPayload.time !== nextPayload.time
      || currentPayload.details?.stadium !== nextPayload.details?.stadium;
    if (scheduleChanged) {
      const extras = await getMatchExtras(id);
      const status = normalizePlanningStatus(extras?.planningStatus);
      if (isVisiblePublicationStatus(status)) {
        const nextExtras: MatchExtras = {
          ...(extras ?? { id }),
          planningStatus: 'modified',
          modifiedAfterPublishAt: new Date().toISOString(),
        };
        await saveMatchExtrasOptimistically(db, id, nextExtras, extras?.planningRevision ?? 0);
        const contacts = await contactsForMatch(id);
        await Promise.all(contacts.map((contact) => notifyContact(db, contact, {
          type: 'event-updated',
          title: 'Planning modifié',
          message: `${nextPayload.localTeam} – ${nextPayload.awayTeam} : ${nextPayload.date} à ${nextPayload.time}${nextPayload.details?.stadium ? `, ${nextPayload.details.stadium}` : ''}.`,
          eventType: 'amical',
          eventId: id,
        })));
      }
    }

    return NextResponse.json({ success: true, match: savedPayload });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error updating match amical:', error);
    return NextResponse.json({ error: 'Failed to update match amical' }, { status: 500 });
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
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id, clubId: auth.user.clubId });
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

    await archivePlanningEvent(db, 'amical', id, auth.user.id, auth.user.clubId);
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
