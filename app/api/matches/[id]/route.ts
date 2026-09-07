import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { MatchAmicalEntity, MatchOfficialEntity } from '@/lib/db/schemas';
import { enrichAssignmentContacts, propagatePublishedAssignmentChange } from '@/lib/planning/assignment-contacts';
import {
  getPlanningEventSnapshot,
  PlanningConcurrencyError,
  saveMatchExtrasOptimistically,
} from '@/lib/planning/event-store';
import { setCurrentClubId } from '@/lib/auth/club-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const matchId = resolvedParams.id;
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json({ error: 'ID de match invalide' }, { status: 400 });
    }

    const db = await getDb();
    const row = await db.getRepository('MatchExtra').findOneBy({ matchId, clubId: auth.user.clubId });
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
  setCurrentClubId(auth.user.clubId);

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const matchId = resolvedParams.id;
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json({ error: 'ID de match invalide' }, { status: 400 });
    }

    const body = await request.json();
    const db = await getDb();
    const repo = db.getRepository('MatchExtra');
    const existing = await repo.findOneBy({ matchId, clubId: auth.user.clubId });
    const previous: MatchExtras = existing
      ? (existing.payload as unknown as MatchExtras)
      : { id: matchId };

    const extras: MatchExtras = {
      ...previous,
      id: matchId,
      confirmed: body.confirmed === true || body.confirmed === false ? body.confirmed : previous.confirmed,
      arbitreTouche: await enrichAssignmentContacts(
        db,
        auth.user.clubId,
        body.arbitreTouche ?? previous.arbitreTouche,
        'officiel',
        previous.arbitreTouche,
      ),
      contactEncadrants: await enrichAssignmentContacts(
        db,
        auth.user.clubId,
        body.contactEncadrants ?? previous.contactEncadrants,
        'encadrant',
        previous.contactEncadrants,
      ),
      contactAccompagnateur: await enrichAssignmentContacts(
        db,
        auth.user.clubId,
        body.contactAccompagnateur ?? previous.contactAccompagnateur,
        'accompagnateur',
        previous.contactAccompagnateur,
      ),
    };

    const official = await db.getRepository<MatchOfficialEntity>('MatchOfficial').findOneBy({ id: matchId, clubId: auth.user.clubId });
    const friendly = official ? null : await db.getRepository<MatchAmicalEntity>('MatchAmical').findOneBy({ id: matchId, clubId: auth.user.clubId });
    const eventType = official ? 'officiel' : 'amical';
    const snapshot = official || friendly ? await getPlanningEventSnapshot(db, eventType, matchId) : null;
    const before = existing ? (existing.payload as unknown as Record<string, unknown>) : null;
    const savedExtras = await saveMatchExtrasOptimistically(db, matchId, extras, snapshot?.revision ?? 0);

    // Un match déjà publié doit refléter immédiatement une affectation ajoutée/modifiée ici :
    // sans ça, la personne concernée n'est jamais notifiée et ne voit rien dans « Mon planning »
    // tant que le planning global n'est pas republié (issue #161).
    if (snapshot) {
      await Promise.all([
        propagatePublishedAssignmentChange(db, auth.user.clubId, eventType, matchId, 'arbitre', previous.arbitreTouche, savedExtras.arbitreTouche),
        propagatePublishedAssignmentChange(db, auth.user.clubId, eventType, matchId, 'encadrant', previous.contactEncadrants, savedExtras.contactEncadrants),
        propagatePublishedAssignmentChange(db, auth.user.clubId, eventType, matchId, 'accompagnateur', previous.contactAccompagnateur, savedExtras.contactAccompagnateur),
      ]);
    }

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

    return NextResponse.json({ success: true, extras: savedExtras });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Erreur PUT match extras:', error);
    return NextResponse.json({ error: 'Erreur lors de la modification des informations' }, { status: 500 });
  }
}
