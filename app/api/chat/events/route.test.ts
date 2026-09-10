import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('GET /api/chat/events', () => {
  it('returns 401 without a session', async () => {
    const response = await GET(new NextRequest('http://localhost/api/chat/events'));
    expect(response.status).toBe(401);
  });

  it('returns event chat rooms for an authenticated user', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await GET(new NextRequest('http://localhost/api/chat/events', {
        headers: { cookie: `session_token=${token}` },
      }));
      expect(response.status).toBe(200);
      const body = await response.json() as { events: unknown[] };
      expect(Array.isArray(body.events)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
