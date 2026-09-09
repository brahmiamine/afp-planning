import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { hasPlanningFunction, isPlanningFunction, PLANNING_FUNCTION_LABELS, type PlanningFunction } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import {
  DEFAULT_PLANNING_PREFERENCES,
  normalizePlanningPreferences,
} from '@/lib/planning/advanced-rules';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import { notifyAdmins } from '@/lib/notifications/service';
import { personTypeForFunction } from '@/lib/planning/person-link';
import { setCurrentClubId } from '@/lib/auth/club-context';

function preferenceId(planningFunction: PlanningFunction, personId: number): string {
  return `person-preference:${personTypeForFunction(planningFunction)}:${personId}`;
}

function requestedFunction(request: NextRequest, body?: unknown): PlanningFunction | null {
  const queryValue = new URL(request.url).searchParams.get('function');
  const bodyValue = body && typeof body === 'object'
    ? (body as { planningFunction?: unknown }).planningFunction
    : null;
  const value = queryValue ?? bodyValue;
  return isPlanningFunction(value) ? value : null;
}

function authorizeFunction(request: NextRequest, planningFunctions: PlanningFunction[], body?: unknown) {
  const planningFunction = requestedFunction(request, body);
  if (!planningFunction) {
    return { error: NextResponse.json({ error: 'Fonction de planning requise' }, { status: 400 }) };
  }
  if (!hasPlanningFunction(planningFunctions, planningFunction)) {
    return { error: NextResponse.json({ error: 'Cette fonction ne vous est pas attribuée' }, { status: 403 }) };
  }
  return { planningFunction };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const authorized = authorizeFunction(request, auth.user.planningFunctions);
  if ('error' in authorized) return authorized.error;

  const db = await getDb();
  const record = await getPlanningRecord(db, preferenceId(authorized.planningFunction, auth.user.id));
  return NextResponse.json({
    planningFunction: authorized.planningFunction,
    preferences: record ? normalizePlanningPreferences(record.payload) : DEFAULT_PLANNING_PREFERENCES,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const body = await request.json();
    const authorized = authorizeFunction(request, auth.user.planningFunctions, body);
    if ('error' in authorized) return authorized.error;
    const preferences = normalizePlanningPreferences(body);
    const db = await getDb();
    await savePlanningRecord(db, {
      id: preferenceId(authorized.planningFunction, auth.user.id),
      kind: 'person-preference',
      ownerUserId: auth.user.id,
      personType: personTypeForFunction(authorized.planningFunction),
      personId: auth.user.id,
      payload: { ...preferences, planningFunction: authorized.planningFunction },
    });
    await notifyAdmins(db, {
      type: 'planning-preferences-updated',
      title: 'Préférences planning mises à jour',
      message: `${auth.user.nom} a mis à jour ses préférences ${PLANNING_FUNCTION_LABELS[authorized.planningFunction].toLowerCase()}.`,
    });
    return NextResponse.json({ success: true, planningFunction: authorized.planningFunction, preferences });
  } catch (error) {
    console.error('Error updating planning preferences:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour vos préférences' }, { status: 500 });
  }
}
