import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('GET /api/chat/users', () => {
  it('returns 401 without a session', async () => {
    const response = await GET(new NextRequest('http://localhost/api/chat/users'));
    expect(response.status).toBe(401);
  });

  it('returns chat users for an authenticated member', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await GET(new NextRequest('http://localhost/api/chat/users', {
        headers: { cookie: `session_token=${token}` },
      }));
      expect(response.status).toBe(200);
      const body = await response.json() as { users: unknown[] };
      expect(Array.isArray(body.users)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
