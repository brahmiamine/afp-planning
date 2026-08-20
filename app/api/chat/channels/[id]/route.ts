import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { chatErrorResponse, participantIdsFrom } from '@/lib/chat/http';
import { archiveChannel, updateChannel } from '@/lib/chat/service';

type Context = { params: Promise<{ id: string }> | { id: string } };

async function roomIdFrom(context: Context): Promise<string> {
  return (context.params instanceof Promise ? await context.params : context.params).id;
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  try {
    const body = await request.json();
    const db = await getDb();
    const room = await updateChannel(
      db,
      auth.user,
      await roomIdFrom(context),
      body,
      participantIdsFrom(body.participantUserIds),
    );
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'ChatChannel',
      entityId: room.id,
      action: 'update',
      before: null,
      after: { name: room.name, clubId: room.clubId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return chatErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  try {
    const db = await getDb();
    const roomId = await roomIdFrom(context);
    await archiveChannel(db, auth.user, roomId);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'ChatChannel',
      entityId: roomId,
      action: 'archive',
      before: null,
      after: { archived: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
