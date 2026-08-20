import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { buildReadableHistory } from '@/lib/planning/history';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const rawLimit = Number.parseInt(new URL(request.url).searchParams.get('limit') ?? '100', 10);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
    return NextResponse.json({ items: await buildReadableHistory(await getDb(), limit) });
  } catch (error) {
    console.error('Planning history failed:', error);
    return NextResponse.json({ error: 'Impossible de charger l’historique du planning' }, { status: 500 });
  }
}
