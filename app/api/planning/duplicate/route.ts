import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { getPlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';
import { resetAssignmentForDuplicate, shiftPlanningDate } from '@/lib/planning/productivity';
import type { Entrainement, Match, Plateau } from '@/types/match';
import { setCurrentClubId } from '@/lib/auth/club-context';

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const eventType = body.eventType;
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const offsetDays = Number(body.offsetDays);
    const copyAssignments = body.copyAssignments === true;
    if (!eventId || !validEventType(eventType) || !Number.isInteger(offsetDays) || Math.abs(offsetDays) > 3660) {
      return NextResponse.json({ error: 'Duplication invalide' }, { status: 400 });
    }
    if (eventType === 'officiel') {
      return NextResponse.json({ error: 'Un match officiel importé ne peut pas être dupliqué. Dupliquez uniquement son organisation vers un événement manuel.' }, { status: 409 });
    }

    const db = await getDb();
    const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
    const nextDate = shiftPlanningDate(snapshot.date, offsetDays);
    if (!nextDate) return NextResponse.json({ error: 'Date source invalide' }, { status: 409 });
    const id = `${eventType}-copy-${randomUUID()}`;

    if (eventType === 'amical') {
      const source = snapshot.event as Match;
      const next: Match = { ...source, id, type: 'amical', date: nextDate, seriesId: undefined };
      await db.getRepository('MatchAmical').save({ id, clubId: auth.user.clubId, date: nextDate, time: next.time || '', payload: next as unknown as Record<string, unknown> });
      const sourceExtras = snapshot.extras as MatchExtras | undefined;
      const extras: MatchExtras = {
        id,
        planningStatus: 'draft',
        confirmed: false,
        arbitreTouche: copyAssignments ? (sourceExtras?.arbitreTouche ?? []).map(resetAssignmentForDuplicate) : [],
        contactEncadrants: copyAssignments ? (sourceExtras?.contactEncadrants ?? []).map(resetAssignmentForDuplicate) : [],
        contactAccompagnateur: copyAssignments ? (sourceExtras?.contactAccompagnateur ?? []).map(resetAssignmentForDuplicate) : [],
      };
      await db.getRepository('MatchExtra').save({ matchId: id, clubId: auth.user.clubId, payload: extras as unknown as Record<string, unknown> });
      await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: { source: `${eventType}:${eventId}` }, after: { eventType, date: nextDate, copyAssignments } });
      return NextResponse.json({ success: true, event: next, planningStatus: 'draft' });
    }

    if (eventType === 'entrainement') {
      const source = snapshot.event as Entrainement;
      const next: Entrainement = {
        ...source,
        id,
        date: nextDate,
        seriesId: undefined,
        planningStatus: 'draft',
        publishedAt: undefined,
        publishedByUserId: undefined,
        modifiedAfterPublishAt: undefined,
        cancelledAt: undefined,
        cancelledByUserId: undefined,
        cancellationReason: undefined,
        encadrants: copyAssignments ? (source.encadrants ?? []).map(resetAssignmentForDuplicate) : [],
      };
      await db.getRepository('Entrainement').save({ id, clubId: auth.user.clubId, date: nextDate, time: next.time || '', payload: next as unknown as Record<string, unknown> });
      await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: { source: `${eventType}:${eventId}` }, after: { eventType, date: nextDate, copyAssignments } });
      return NextResponse.json({ success: true, event: next });
    }

    const source = snapshot.event as Plateau;
    const next: Plateau = {
      ...source,
      id,
      date: nextDate,
      seriesId: undefined,
      planningStatus: 'draft',
      publishedAt: undefined,
      publishedByUserId: undefined,
      modifiedAfterPublishAt: undefined,
      cancelledAt: undefined,
      cancelledByUserId: undefined,
      cancellationReason: undefined,
      encadrants: copyAssignments ? (source.encadrants ?? []).map(resetAssignmentForDuplicate) : [],
    };
    await db.getRepository('Plateau').save({ id, clubId: auth.user.clubId, date: nextDate, time: next.time || '', payload: next as unknown as Record<string, unknown> });
    await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: { source: `${eventType}:${eventId}` }, after: { eventType, date: nextDate, copyAssignments } });
    return NextResponse.json({ success: true, event: next });
  } catch (error) {
    console.error('Planning duplicate failed:', error);
    return NextResponse.json({ error: 'Impossible de dupliquer l’événement' }, { status: 500 });
  }
}
