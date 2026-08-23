import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { deletePlanningRecord, getPlanningRecord, listPlanningRecords, planningRecordId, savePlanningRecord } from '@/lib/planning/records';
import { setCurrentClubId } from '@/lib/auth/club-context';

interface SavedFilterPayload {
  name: string;
  filters: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const db = await getDb();
  return NextResponse.json({ filters: await listPlanningRecords<SavedFilterPayload>(db, { kind: 'saved-filter', ownerUserId: auth.user.id }, 100) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const filters = body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters) ? body.filters as Record<string, unknown> : null;
    if (!name || !filters || JSON.stringify(filters).length > 10_000) return NextResponse.json({ error: 'Filtre invalide' }, { status: 400 });
    const db = await getDb();
    const id = planningRecordId('saved-filter');
    const payload: SavedFilterPayload = { name, filters };
    await savePlanningRecord(db, { id, kind: 'saved-filter', ownerUserId: auth.user.id, payload });
    return NextResponse.json({ success: true, filter: { id, payload } });
  } catch (error) {
    console.error('Save planning filter failed:', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer le filtre' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  const db = await getDb();
  const record = await getPlanningRecord(db, id);
  if (!record || record.kind !== 'saved-filter') return NextResponse.json({ error: 'Filtre introuvable' }, { status: 404 });
  if (record.ownerUserId !== auth.user.id) return NextResponse.json({ error: 'Suppression non autorisée' }, { status: 403 });
  await deletePlanningRecord(db, id);
  return NextResponse.json({ success: true });
}
