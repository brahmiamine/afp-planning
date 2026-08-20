import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { chatErrorResponse } from '@/lib/chat/http';
import { getOrCreateEventRoom, listChatEvents } from '@/lib/chat/service';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  try {
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'eventChat');
    if (disabled) return disabled;
    return NextResponse.json({ events: await listChatEvents(db, auth.user) });
  } catch (error) {
    return chatErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  try {
    const body = await request.json();
    const db = await getDb();
    const disabled = await planningFeatureGuard(db, 'eventChat');
    if (disabled) return disabled;
    const room = await getOrCreateEventRoom(
      db,
      auth.user,
      typeof body.eventType === 'string' ? body.eventType : '',
      typeof body.eventId === 'string' ? body.eventId : '',
    );
    return NextResponse.json({ room: { id: room.id } });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
