import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { isReadOnlyRole } from '@/lib/auth/roles';
import { buildPersonalPlanningStats, listPersonalAssignments } from '@/lib/planning/personal-planning';
import { setCurrentClubId } from '@/lib/auth/club-context';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  if (!isReadOnlyRole(auth.user.roles)) {
    return NextResponse.json(
      { error: 'Cet espace est réservé aux arbitres, encadrants et accompagnateurs' },
      { status: 403 },
    );
  }

  try {
    const db = await getDb();
    const assignments = await listPersonalAssignments(db, auth.user);
    return NextResponse.json({
      assignments,
      stats: buildPersonalPlanningStats(assignments),
    });
  } catch (error) {
    console.error('Error loading personal planning:', error);
    return NextResponse.json({ error: 'Impossible de charger votre planning' }, { status: 500 });
  }
}
