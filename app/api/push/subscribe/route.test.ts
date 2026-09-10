import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getDb } from '@/lib/db';
import { POST } from './route';

const dbAvailable = await isDbAvailable();
const trustedEndpoint = 'https://fcm.googleapis.com/fcm/send/example-token';

function subscribeRequest(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { cookie: `session_token=${token}` } : {}),
    },
  });
}

describe.skipIf(!dbAvailable)('POST /api/push/subscribe', () => {
  it('returns 401 without a session', async () => {
    const response = await POST(subscribeRequest({
      endpoint: trustedEndpoint,
      keys: { p256dh: 'a', auth: 'b' },
    }));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid subscription payload', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    try {
      const response = await POST(subscribeRequest({ endpoint: 'https://evil.example/push' }, token));
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('stores a trusted subscription for the current user only', async () => {
    const userA = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    const userB = await createTestUserAndSession('dirigeant', {}, ['encadrant']);
    try {
      const response = await POST(subscribeRequest({
        endpoint: trustedEndpoint,
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      }, userA.token));
      expect(response.status).toBe(200);

      const db = await getDb();
      const rows = await db.query(
        'SELECT user_id FROM push_subscriptions WHERE endpoint = ?',
        [trustedEndpoint],
      ) as Array<{ user_id: number }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_id).toBe(userA.user.id);
      expect(rows[0]?.user_id).not.toBe(userB.user.id);
    } finally {
      const db = await getDb();
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [trustedEndpoint]);
      await userA.cleanup();
      await userB.cleanup();
    }
  });
});
