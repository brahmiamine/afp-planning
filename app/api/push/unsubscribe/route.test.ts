import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getDb } from '@/lib/db';
import { savePushSubscription } from '@/lib/push/store';
import { POST } from './route';

const dbAvailable = await isDbAvailable();
const trustedEndpoint = 'https://fcm.googleapis.com/fcm/send/unsubscribe-example';

function unsubscribeRequest(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { cookie: `session_token=${token}` } : {}),
    },
  });
}

describe.skipIf(!dbAvailable)('POST /api/push/unsubscribe', () => {
  it('returns 401 without a session', async () => {
    const response = await POST(unsubscribeRequest({ endpoint: trustedEndpoint }));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid endpoint', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    try {
      const response = await POST(unsubscribeRequest({ endpoint: 123 }, token));
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('removes the subscription for the authenticated user', async () => {
    const { token, user, cleanup } = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    const db = await getDb();
    try {
      await savePushSubscription(db, user.id, {
        endpoint: trustedEndpoint,
        keys: { p256dh: 'x', auth: 'y' },
      }, 'test-agent');

      const response = await POST(unsubscribeRequest({ endpoint: trustedEndpoint }, token));
      expect(response.status).toBe(200);

      const rows = await db.query(
        'SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
        [trustedEndpoint, user.id],
      ) as unknown[];
      expect(rows).toHaveLength(0);
    } finally {
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [trustedEndpoint]);
      await cleanup();
    }
  });
});
