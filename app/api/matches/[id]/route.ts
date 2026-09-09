import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { MatchAmicalEntity, MatchOfficialEntity } from '@/lib/db/schemas';
import { enrichAssignmentContacts } from '@/lib/planning/assignment-contacts';
import { propagateAssignmentChangesIfPublished } from '@/lib/planning/assignment-propagation';
import {
  getPlanningEventSnapshot,
  PlanningConcurrencyError,
  saveMatchExtrasOptimistically,
} from '@/lib/planning/event-store';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { parseMatchExtrasPayload } from '@/lib/db/planning-payload-codecs';

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
    return NextResponse.json(row ? parseMatchExtrasPayload(row.payload, matchId) : null);
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
      ? parseMatchExtrasPayload(existing.payload, matchId)
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

    // Un changement d'affectation sur un match déjà publié reste en préparation : il
    // marque l'événement `modified` et n'est visible/notifié qu'à la prochaine
    // publication globale, au même titre qu'un changement de date ou de lieu (issue #197).
    if (snapshot) {
      const propagationContext = {
        ...snapshot,
        extras: savedExtras as unknown as MatchExtras,
        assignments: {
          arbitre: savedExtras.arbitreTouche ?? [],
          encadrant: savedExtras.contactEncadrants ?? [],
          accompagnateur: savedExtras.contactAccompagnateur ?? [],
        },
      };
      await propagateAssignmentChangesIfPublished(
        db, auth.user.clubId, propagationContext,
        previous.arbitreTouche, savedExtras.arbitreTouche,
      );
      await propagateAssignmentChangesIfPublished(
        db, auth.user.clubId, propagationContext,
        previous.contactEncadrants, savedExtras.contactEncadrants,
      );
      await propagateAssignmentChangesIfPublished(
        db, auth.user.clubId, propagationContext,
        previous.contactAccompagnateur, savedExtras.contactAccompagnateur,
      );
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
