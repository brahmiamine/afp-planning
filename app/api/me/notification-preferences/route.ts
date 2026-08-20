import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import { normalizeNotificationPreferences } from '@/lib/notifications/preferences';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const db = await getDb();
  const record = await getPlanningRecord(db, `notification-preferences:${auth.user.id}`);
  return NextResponse.json({ preferences: normalizeNotificationPreferences(record?.payload) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  try {
    const body = await request.json();
    const preferences = normalizeNotificationPreferences(body);
    const db = await getDb();
    await savePlanningRecord(db, {
      id: `notification-preferences:${auth.user.id}`,
      kind: 'notification-preferences',
      ownerUserId: auth.user.id,
      personType: auth.user.personType,
      personId: auth.user.personId,
      payload: preferences,
    });
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error('Notification preferences update failed:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour vos notifications' }, { status: 500 });
  }
}
