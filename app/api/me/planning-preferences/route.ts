import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { isPlanningFunction, type PlanningFunction } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import {
  DEFAULT_PLANNING_PREFERENCES,
  normalizePlanningPreferences,
} from '@/lib/planning/advanced-rules';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import { notifyAdmins } from '@/lib/notifications/service';
import type { SessionUser } from '@/lib/auth/session';
import { personTypeForFunction, planningFunctionsOf } from '@/lib/planning/person-link';
import { setCurrentClubId } from '@/lib/auth/club-context';

function preferenceId(personType: string, personId: number): string {
  return `person-preference:${personType}:${personId}`;
}

/**
 * Résout la fonction pour laquelle on lit/écrit des préférences (issue #202) : une fonction
 * explicite doit être fournie et effectivement tenue par le dirigeant — jamais déduite d'un
 * « premier rôle », puisque les préférences (charge, catégories, créneaux…) sont propres à
 * chaque fonction terrain, contrairement aux indisponibilités personnelles qui restent
 * communes à la personne. Par confort, si le dirigeant ne tient qu'une seule fonction, elle
 * est utilisée par défaut.
 */
function resolvePlanningFunction(user: SessionUser, requested: string | null): PlanningFunction | null {
  const held = planningFunctionsOf(user);
  if (requested) {
    if (!isPlanningFunction(requested) || !held.includes(requested)) return null;
    return requested;
  }
  return held.length === 1 ? held[0]! : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const requested = new URL(request.url).searchParams.get('function');
  const planningFunction = resolvePlanningFunction(auth.user, requested);
  if (!planningFunction) {
    return NextResponse.json({ error: 'Fonction invalide ou non tenue par ce compte' }, { status: 403 });
  }

  const db = await getDb();
  const personType = personTypeForFunction(planningFunction);
  const record = await getPlanningRecord(db, preferenceId(personType, auth.user.id));
  return NextResponse.json({
    function: planningFunction,
    preferences: record ? normalizePlanningPreferences(record.payload) : DEFAULT_PLANNING_PREFERENCES,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const planningFunction = resolvePlanningFunction(auth.user, typeof body.function === 'string' ? body.function : null);
    if (!planningFunction) {
      return NextResponse.json({ error: 'Fonction invalide ou non tenue par ce compte' }, { status: 403 });
    }

    const personType = personTypeForFunction(planningFunction);
    const preferences = normalizePlanningPreferences(body);
    const db = await getDb();
    await savePlanningRecord(db, {
      id: preferenceId(personType, auth.user.id),
      kind: 'person-preference',
      ownerUserId: auth.user.id,
      personType,
      personId: auth.user.id,
      payload: preferences,
    });
    await notifyAdmins(db, {
      type: 'planning-preferences-updated',
      title: 'Préférences planning mises à jour',
      message: `${auth.user.nom} a mis à jour ses préférences d’affectation (${planningFunction}).`,
    });
    return NextResponse.json({ success: true, function: planningFunction, preferences });
  } catch (error) {
    console.error('Error updating planning preferences:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour vos préférences' }, { status: 500 });
  }
}
