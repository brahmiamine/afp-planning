import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { isReadOnlyRole } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import {
  DEFAULT_PLANNING_PREFERENCES,
  normalizePlanningPreferences,
} from '@/lib/planning/advanced-rules';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import { notifyAdmins } from '@/lib/notifications/service';
import type { SessionUser } from '@/lib/auth/session';
import { personTypeForRole } from '@/lib/planning/person-link';
import { setCurrentClubId } from '@/lib/auth/club-context';

function preferenceId(personType: string, personId: number): string {
  return `person-preference:${personType}:${personId}`;
}

function requirePersonType(user: SessionUser): string | null {
  if (!isReadOnlyRole(user.roles)) return null;
  return personTypeForRole(user.role);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const personType = requirePersonType(auth.user);
  if (!personType) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const db = await getDb();
  const record = await getPlanningRecord(db, preferenceId(personType, auth.user.id));
  return NextResponse.json({
    preferences: record ? normalizePlanningPreferences(record.payload) : DEFAULT_PLANNING_PREFERENCES,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const personType = requirePersonType(auth.user);
  if (!personType) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  try {
    const body = await request.json();
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
      message: `${auth.user.nom} a mis à jour ses préférences d’affectation.`,
    });
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error('Error updating planning preferences:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour vos préférences' }, { status: 500 });
  }
}
