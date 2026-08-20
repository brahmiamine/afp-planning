import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { Match } from '@/types/match';
import type { MatchAmicalEntity, MatchOfficialEntity } from '@/lib/db/schemas';
import { enrichAssignmentContacts, notifyAssignmentChanges } from '@/lib/planning/assignment-contacts';
import { isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import {
  getPlanningEventSnapshot,
  PlanningConcurrencyError,
  saveMatchExtrasOptimistically,
} from '@/lib/planning/event-store';
import { isPlanningFeatureEnabled } from '@/lib/settings-store';
import { PlanningValidationError, validateAssignmentsAgainstDatabase } from '@/lib/planning/validation';

export async function GET(
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
        body.arbitreTouche ?? previous.arbitreTouche,
        'officiel',
        previous.arbitreTouche,
      ),
      contactEncadrants: await enrichAssignmentContacts(
        db,
        body.contactEncadrants ?? previous.contactEncadrants,
        'encadrant',
        previous.contactEncadrants,
      ),
      contactAccompagnateur: await enrichAssignmentContacts(
        db,
        body.contactAccompagnateur ?? previous.contactAccompagnateur,
        'accompagnateur',
        previous.contactAccompagnateur,
      ),
    };

    const official = await db.getRepository<MatchOfficialEntity>('MatchOfficial').findOneBy({ id: matchId, clubId: auth.user.clubId });
    const friendly = official ? null : await db.getRepository<MatchAmicalEntity>('MatchAmical').findOneBy({ id: matchId, clubId: auth.user.clubId });
    const eventType = official ? 'officiel' : 'amical';
    const snapshot = official || friendly ? await getPlanningEventSnapshot(db, eventType, matchId) : null;
    if (snapshot && await isPlanningFeatureEnabled(db, auth.user.clubId, 'assignmentValidation')) {
      const proposed = {
        ...snapshot,
        assignments: {
          arbitre: extras.arbitreTouche ?? [],
          encadrant: extras.contactEncadrants ?? [],
          accompagnateur: extras.contactAccompagnateur ?? [],
        },
      };
      const violations = (await Promise.all([
        validateAssignmentsAgainstDatabase(db, proposed, 'arbitre', proposed.assignments.arbitre),
        validateAssignmentsAgainstDatabase(db, proposed, 'encadrant', proposed.assignments.encadrant),
        validateAssignmentsAgainstDatabase(db, proposed, 'accompagnateur', proposed.assignments.accompagnateur),
      ])).flat();
      if (violations.length) throw new PlanningValidationError('Une ou plusieurs affectations sont invalides.', violations);
    }

    const before = existing ? (existing.payload as unknown as Record<string, unknown>) : null;
    const savedExtras = await saveMatchExtrasOptimistically(db, matchId, extras, snapshot?.revision ?? 0);

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

    if (isVisiblePublicationStatus(normalizePlanningStatus(extras.planningStatus))) {
      const match = (official?.payload ?? friendly?.payload) as unknown as Match | undefined;
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
    }

    return NextResponse.json({ success: true, extras: savedExtras });
  } catch (error) {
    if (error instanceof PlanningValidationError) {
      return NextResponse.json({ error: error.message, violations: error.details }, { status: 409 });
    }
    if (error instanceof PlanningConcurrencyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Erreur PUT match extras:', error);
    return NextResponse.json({ error: 'Erreur lors de la modification des informations' }, { status: 500 });
  }
}
