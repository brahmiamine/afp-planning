import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { appendMessage, createChannel } from '@/lib/chat/service';
import { GET, PATCH } from './route';

const dbAvailable = await isDbAvailable();
const createdRoomIds: string[] = [];

describe.skipIf(!dbAvailable)('GET/PATCH /api/chat/rooms/[id]/messages', () => {
  afterEach(async () => {
    if (createdRoomIds.length === 0) return;
    const db = await getDb();
    await db.getRepository('ChatReadState').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: createdRoomIds }).execute();
    await db.getRepository('ChatMessage').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: createdRoomIds }).execute();
    await db.getRepository('ChatParticipant').createQueryBuilder().delete().where('roomId IN (:...ids)', { ids: createdRoomIds }).execute();
    await db.getRepository('ChatRoom').createQueryBuilder().delete().where('id IN (:...ids)', { ids: createdRoomIds }).execute();
    createdRoomIds.length = 0;
  });

  it('returns 401 without a session', async () => {
    const response = await GET(new NextRequest('http://localhost/api/chat/rooms/room-1/messages'), { params: { id: 'room-1' } });
    expect(response.status).toBe(401);
  });

  it('lists messages and marks the room as read', async () => {
    const admin = await createTestUserAndSession('admin');
    const member = await createTestUserAndSession('dirigeant', { clubId: admin.user.clubId }, ['arbitre_club']);
    try {
      const adminSession = await getSessionUser(admin.token);
      const room = await createChannel(await getDb(), adminSession!, { name: 'Messages' }, [member.user.id]);
      createdRoomIds.push(room.id);
      const sent = await appendMessage(await getDb(), adminSession!, {
        roomId: room.id,
        clientMessageId: '550e8400-e29b-41d4-a716-446655440099',
        content: 'Bonjour',
        attachment: null,
        replyToMessageId: null,
        forwardSourceMessageId: null,
      });

      const listResponse = await GET(new NextRequest(`http://localhost/api/chat/rooms/${room.id}/messages`, {
        headers: { cookie: `session_token=${member.token}` },
      }), { params: { id: room.id } });
      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json() as { messages: Array<{ content: string }> };
      expect(listBody.messages.some((message) => message.content === 'Bonjour')).toBe(true);

      const readResponse = await PATCH(new NextRequest(`http://localhost/api/chat/rooms/${room.id}/messages`, {
        method: 'PATCH',
        body: JSON.stringify({ sequence: sent.message.sequence }),
        headers: {
          cookie: `session_token=${member.token}`,
          'Content-Type': 'application/json',
        },
      }), { params: { id: room.id } });
      expect(readResponse.status).toBe(200);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });
});
