import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { getDb } from '@/lib/db';
import { canReadPlanningEventWorkspace } from '@/lib/planning/event-access';
import { getPlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';

function validEventType(value: string): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventType: string; eventId: string }> | { eventType: string; eventId: string } },
) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  const resolved = params instanceof Promise ? await params : params;
  if (!validEventType(resolved.eventType) || !resolved.eventId) {
    return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });
  }

  const db = await getDb();
  const snapshot = await getPlanningEventSnapshot(db, resolved.eventType, resolved.eventId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });
  }
  if (!canReadPlanningEventWorkspace(auth.user, snapshot)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  return NextResponse.json(snapshot);
}
