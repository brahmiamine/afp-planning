import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('POST /api/chat/direct', () => {
  it('returns 401 without a session', async () => {
    const response = await POST(new NextRequest('http://localhost/api/chat/direct', {
      method: 'POST',
      body: JSON.stringify({ userId: 1 }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(response.status).toBe(401);
  });

  it('creates or returns a direct room between two club members', async () => {
    const first = await createTestUserAndSession('admin');
    const second = await createTestUserAndSession('dirigeant', { clubId: first.user.clubId }, ['arbitre_club']);
    try {
      const response = await POST(new NextRequest('http://localhost/api/chat/direct', {
        method: 'POST',
        body: JSON.stringify({ userId: second.user.id }),
        headers: {
          cookie: `session_token=${first.token}`,
          'Content-Type': 'application/json',
        },
      }));
      expect(response.status).toBe(200);
      const body = await response.json() as { room: { id: string } };
      expect(body.room.id).toBeTruthy();
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });
});
