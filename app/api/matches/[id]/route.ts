import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { Match } from '@/types/match';
import type { MatchAmicalEntity, MatchOfficialEntity } from '@/lib/db/schemas';
import { enrichAssignmentContacts, notifyAssignmentChanges } from '@/lib/planning/assignment-contacts';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const matchId = resolvedParams.id;
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json({ error: 'ID de match invalide' }, { status: 400 });
    }

    const db = await getDb();
    const row = await db.getRepository('MatchExtra').findOneBy({ matchId });
    return NextResponse.json(row ? (row.payload as unknown as MatchExtras) : null);
  } catch (error) {
    console.error('Erreur GET match extras:', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des informations' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const matchId = resolvedParams.id;
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json({ error: 'ID de match invalide' }, { status: 400 });
    }

    const body = await request.json();
    const db = await getDb();
    const repo = db.getRepository('MatchExtra');
    const existing = await repo.findOneBy({ matchId });
    const previous = existing ? (existing.payload as unknown as MatchExtras) : { id: matchId };

    const extras: MatchExtras = {
      id: matchId,
      confirmed: body.confirmed === true || body.confirmed === false ? body.confirmed : previous.confirmed,
      arbitreTouche: await enrichAssignmentContacts(db, body.arbitreTouche, 'officiel', previous.arbitreTouche),
      contactEncadrants: await enrichAssignmentContacts(db, body.contactEncadrants, 'encadrant', previous.contactEncadrants),
      contactAccompagnateur: await enrichAssignmentContacts(db, body.contactAccompagnateur, 'accompagnateur', previous.contactAccompagnateur),
    };

    const before = existing ? (existing.payload as unknown as Record<string, unknown>) : null;
    await repo.save({ matchId, payload: extras as unknown as Record<string, unknown> });

    try {
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'MatchExtra',
        entityId: matchId,
        action: before ? 'update' : 'create',
        before,
        after: extras as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.error('Erreur audit log match extras:', auditError);
    }

    const official = await db.getRepository<MatchOfficialEntity>('MatchOfficial').findOneBy({ id: matchId });
    const friendly = official ? null : await db.getRepository<MatchAmicalEntity>('MatchAmical').findOneBy({ id: matchId });
    const match = (official?.payload ?? friendly?.payload) as unknown as Match | undefined;
    const eventType = official ? 'officiel' : 'amical';
    const eventLabel = match ? `${match.localTeam} – ${match.awayTeam}` : `Match ${matchId}`;
    const context = {
      eventType,
      eventId: matchId,
      eventLabel,
      date: match?.date,
      time: match?.time,
    };

    await Promise.all([
      notifyAssignmentChanges(db, previous.arbitreTouche, extras.arbitreTouche, { ...context, roleLabel: 'Arbitre' }),
      notifyAssignmentChanges(db, previous.contactEncadrants, extras.contactEncadrants, { ...context, roleLabel: 'Encadrant' }),
      notifyAssignmentChanges(db, previous.contactAccompagnateur, extras.contactAccompagnateur, { ...context, roleLabel: 'Accompagnateur' }),
    ]);

    return NextResponse.json({ success: true, extras });
  } catch (error) {
    console.error('Erreur PUT match extras:', error);
    return NextResponse.json({ error: 'Erreur lors de la modification des informations' }, { status: 500 });
  }
}
