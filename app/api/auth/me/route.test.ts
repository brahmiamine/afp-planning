import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

function meRequest(token?: string) {
  return new NextRequest('http://localhost/api/auth/me', {
    headers: token ? { cookie: `session_token=${token}` } : {},
  });
}

describe.skipIf(!dbAvailable)('GET /api/auth/me (integration)', () => {
  it('returns the current user for a valid session', async () => {
    const { token, user, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await GET(meRequest(token));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.email).toBe(user.email);
      expect(body.passwordHash).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it('returns 401 without a session cookie', async () => {
    const response = await GET(meRequest());
    expect(response.status).toBe(401);
  });
});
