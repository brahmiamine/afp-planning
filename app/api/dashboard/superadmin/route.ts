import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { buildSuperadminDashboardData } from '@/lib/planning/dashboard-data';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    return NextResponse.json(await buildSuperadminDashboardData(db, auth.user.id));
  } catch (error) {
    console.error('Superadmin dashboard failed:', error);
    return NextResponse.json({ error: 'Impossible de charger le dashboard' }, { status: 500 });
  }
}
