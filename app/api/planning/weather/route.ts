import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { getPlanningWeather } from '@/lib/planning/weather';
import type { PlanningEventType } from '@/lib/planning/event-store';

function eventType(value: string | null): PlanningEventType | null {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau' ? value : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const type = eventType(params.get('eventType'));
  const eventId = params.get('eventId')?.trim();
  if (!type || !eventId) return NextResponse.json({ error: 'Événement invalide' }, { status: 400 });

  try {
    return NextResponse.json(await getPlanningWeather(await getDb(), type, eventId), {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('Planning weather failed:', error);
    return NextResponse.json({ available: false, reason: 'provider-unavailable' });
  }
}
