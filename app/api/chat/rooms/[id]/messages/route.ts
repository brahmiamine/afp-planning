import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { chatErrorResponse } from '@/lib/chat/http';
import { listMessages, markRoomRead } from '@/lib/chat/service';
import { setCurrentClubId } from '@/lib/auth/club-context';

type Context = { params: Promise<{ id: string }> | { id: string } };

async function roomIdFrom(context: Context): Promise<string> {
  return (context.params instanceof Promise ? await context.params : context.params).id;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  try {
    const afterSequence = Number(new URL(request.url).searchParams.get('afterSequence') ?? '0');
    const result = await listMessages(await getDb(), auth.user, await roomIdFrom(context), {
      afterSequence: Number.isInteger(afterSequence) && afterSequence > 0 ? afterSequence : undefined,
    });
    return NextResponse.json({ messages: result.messages, peerReadSequence: result.peerReadSequence });
  } catch (error) {
    return chatErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  try {
    const body = await request.json();
    await markRoomRead(await getDb(), auth.user, await roomIdFrom(context), Number(body.sequence));
    return NextResponse.json({ success: true });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
