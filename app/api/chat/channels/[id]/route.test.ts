import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { createChannel } from '@/lib/chat/service';
import { DELETE, PATCH } from './route';

const dbAvailable = await isDbAvailable();
const createdRoomIds: string[] = [];

describe.skipIf(!dbAvailable)('PATCH/DELETE /api/chat/channels/[id]', () => {
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
    const response = await PATCH(new NextRequest('http://localhost/api/chat/channels/room-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renommé' }),
      headers: { 'Content-Type': 'application/json' },
    }), { params: { id: 'room-1' } });
    expect(response.status).toBe(401);
  });

  it('updates then archives a channel', async () => {
    const admin = await createTestUserAndSession('admin');
    const member = await createTestUserAndSession('dirigeant', { clubId: admin.user.clubId }, ['encadrant']);
    try {
      const session = await getSessionUser(admin.token);
      const room = await createChannel(await getDb(), session!, { name: 'Ancien nom' }, [member.user.id]);
      createdRoomIds.push(room.id);

      const patchResponse = await PATCH(new NextRequest(`http://localhost/api/chat/channels/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nouveau nom', participantUserIds: [member.user.id] }),
        headers: {
          cookie: `session_token=${admin.token}`,
          'Content-Type': 'application/json',
        },
      }), { params: { id: room.id } });
      expect(patchResponse.status).toBe(200);

      const deleteResponse = await DELETE(new NextRequest(`http://localhost/api/chat/channels/${room.id}`, {
        method: 'DELETE',
        headers: { cookie: `session_token=${admin.token}` },
      }), { params: { id: room.id } });
      expect(deleteResponse.status).toBe(200);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });
});
