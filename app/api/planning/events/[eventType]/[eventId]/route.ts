import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import {
  canManagePlanningEventWorkspace,
  canReadPlanningEventWorkspace,
  personalPlanningAccessUser,
  resolvePlanningEventForAccess,
} from '@/lib/planning/event-access';
import {
  getPlanningEventSnapshot,
  PlanningConcurrencyError,
  saveBasePlanningEventOptimistically,
  savePlanningPublication,
  type PlanningEventType,
} from '@/lib/planning/event-store';
import { applyPlanningEventUpdate } from '@/lib/planning/event-update';
import { createTeamLogoResolver } from '@/lib/planning/team-logos';
import type { Entrainement, Match, Plateau } from '@/types/match';

function validEventType(value: string): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

async function resolveParams(
  params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string },
) {
  return params instanceof Promise ? await params : params;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string } },
) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  const resolved = await resolveParams(params);
  if (!validEventType(resolved.eventType) || !resolved.eventId) {
    return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });
  }

  const db = await getDb();
  const personalScope = new URL(request.url).searchParams.get('scope') === 'personal';
  const accessUser = personalScope ? personalPlanningAccessUser(auth.user) : auth.user;
  if (!accessUser) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const snapshot = await resolvePlanningEventForAccess(
    db,
    accessUser,
    resolved.eventType,
    resolved.eventId,
  );
  if (!snapshot) {
    return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
  }
  if (!canReadPlanningEventWorkspace(accessUser, snapshot)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const teamLogos = await createTeamLogoResolver(db, auth.user.clubId);
  return NextResponse.json({
    ...snapshot,
    ...teamLogos(snapshot.event),
    canManage: canManagePlanningEventWorkspace(accessUser),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string } },
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  const resolved = await resolveParams(params);
  if (!validEventType(resolved.eventType) || !resolved.eventId) {
    return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });
  }
  // Constantes locales : le rétrécissement de type de `resolved.eventType` ne survit pas
  // à la fermeture passée à `db.transaction()` plus bas.
  const eventType = resolved.eventType;
  const eventId = resolved.eventId;

  try {
    const body = await request.json() as Record<string, unknown>;
    const db = await getDb();
    const preSnapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!preSnapshot) {
      return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
    }

    const before = preSnapshot.event as unknown as Record<string, unknown>;
    let updated = applyPlanningEventUpdate(eventType, preSnapshot.event, body);

    if (
      (eventType === 'entrainement' || eventType === 'plateau')
      && preSnapshot.planningStatus === 'published'
    ) {
      updated = {
        ...updated,
        planningStatus: 'modified',
        modifiedAfterPublishAt: new Date().toISOString(),
      } as Entrainement | Plateau;
    }

    // Comme les autres surfaces d'écriture du planning (matches, entrainements, plateaux,
    // affectations, publication) : le client doit fournir la révision qu'il a lue pour
    // détecter une modification concurrente, plutôt que d'écraser silencieusement un
    // changement fait entre-temps par un autre utilisateur (issue #163).
    const expectedRevisionRaw = body.expectedRevision;
    const expectedRevision = typeof expectedRevisionRaw === 'number' && Number.isFinite(expectedRevisionRaw)
      ? expectedRevisionRaw
      : (preSnapshot.revision ?? 0);

    const auditEntityType = eventType === 'officiel'
      ? 'MatchOfficial'
      : eventType === 'amical'
        ? 'MatchAmical'
        : eventType === 'entrainement'
          ? 'Entrainement'
          : 'Plateau';

    // Donnée source, statut de publication (matches officiels/amicaux) et entrée d'audit
    // partagent désormais une unique transaction : une panne sur l'une de ces écritures
    // annule les autres au lieu de laisser un contenu modifié avec un statut encore publié
    // et une réponse 500 (issue #152).
    const refreshed = await db.transaction(async (manager) => {
      await saveBasePlanningEventOptimistically(
        manager,
        eventType,
        eventId,
        updated as Match | Entrainement | Plateau,
        expectedRevision,
      );

      if (
        (eventType === 'officiel' || eventType === 'amical')
        && preSnapshot.planningStatus === 'published'
      ) {
        await savePlanningPublication(manager, preSnapshot, {
          planningStatus: 'modified',
          modifiedAfterPublishAt: new Date().toISOString(),
        });
      }

      const next = await getPlanningEventSnapshot(manager, eventType, eventId);
      await logAuditEntry(manager, {
        user: auth.user,
        entityType: auditEntityType,
        entityId: eventId,
        action: 'update',
        before,
        after: (next?.event as unknown as Record<string, unknown> | undefined) ?? null,
      });
      return next;
    });

    return NextResponse.json({
      success: true,
      event: refreshed,
    });
  } catch (error) {
    if (error instanceof PlanningConcurrencyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Planning event update failed:', error);
    return NextResponse.json({ error: 'Impossible de modifier cet événement' }, { status: 500 });
  }
}
