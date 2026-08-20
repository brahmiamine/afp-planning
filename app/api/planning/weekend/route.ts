import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { getWeekendPlanning } from '@/lib/planning/weekend';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    return NextResponse.json(await getWeekendPlanning(await getDb()));
  } catch (error) {
    console.error('Weekend planning failed:', error);
    return NextResponse.json({ error: 'Impossible de charger le planning du week-end' }, { status: 500 });
  }
}
