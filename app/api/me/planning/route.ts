import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { hasFieldRole } from '@/lib/auth/roles';
import { buildPersonalPlanningStats, listPersonalAssignments } from '@/lib/planning/personal-planning';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  if (!hasFieldRole(auth.user.roles)) {
    return NextResponse.json(
      { error: 'Cet espace est réservé aux arbitres, encadrants et accompagnateurs' },
      { status: 403 },
    );
  }

  try {
    const db = await getDb();
    const [assignments, settings] = await Promise.all([
      listPersonalAssignments(db, auth.user),
      readAppSettings(db, auth.user.clubId),
    ]);
    return NextResponse.json({
      assignments,
      // Statistiques (à venir / passé, présence en attente) calculées dans le fuseau du club (issue #45).
      stats: buildPersonalPlanningStats(assignments, settings.timeZone),
    });
  } catch (error) {
    console.error('Error loading personal planning:', error);
    return NextResponse.json({ error: 'Impossible de charger votre planning' }, { status: 500 });
  }
}
