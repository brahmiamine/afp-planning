import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { chatErrorResponse, participantIdsFrom } from '@/lib/chat/http';
import { createChannel } from '@/lib/chat/service';
import { setCurrentClubId } from '@/lib/auth/club-context';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  try {
    const body = await request.json();
    const db = await getDb();
    const room = await createChannel(db, auth.user, body, participantIdsFrom(body.participantUserIds));
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'ChatChannel',
      entityId: room.id,
      action: 'create',
      before: null,
      after: { name: room.name, clubId: room.clubId },
    });
    return NextResponse.json({ room: { id: room.id } });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
