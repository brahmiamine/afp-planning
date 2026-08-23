import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { chatErrorResponse } from '@/lib/chat/http';
import { getOrCreateDirectRoom } from '@/lib/chat/service';
import { setCurrentClubId } from '@/lib/auth/club-context';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  try {
    const body = await request.json();
    const room = await getOrCreateDirectRoom(await getDb(), auth.user, Number(body.userId));
    return NextResponse.json({ room: { id: room.id } });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
