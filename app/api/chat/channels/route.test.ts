import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getDb } from '@/lib/db';
import { POST } from './route';

const dbAvailable = await isDbAvailable();
const createdRoomIds: string[] = [];

describe.skipIf(!dbAvailable)('POST /api/chat/channels', () => {
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
    const response = await POST(new NextRequest('http://localhost/api/chat/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ops', participantUserIds: [] }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(response.status).toBe(401);
  });

  it('creates a channel for an authenticated admin', async () => {
    const admin = await createTestUserAndSession('admin');
    const member = await createTestUserAndSession('dirigeant', { clubId: admin.user.clubId }, ['encadrant']);
    try {
      const response = await POST(new NextRequest('http://localhost/api/chat/channels', {
        method: 'POST',
        body: JSON.stringify({ name: 'Canal test', participantUserIds: [member.user.id] }),
        headers: {
          cookie: `session_token=${admin.token}`,
          'Content-Type': 'application/json',
        },
      }));
      expect(response.status).toBe(200);
      const body = await response.json() as { room: { id: string } };
      expect(body.room.id).toBeTruthy();
      createdRoomIds.push(body.room.id);
    } finally {
      await admin.cleanup();
      await member.cleanup();
    }
  });
});
