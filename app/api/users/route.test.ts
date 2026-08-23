import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET, POST } from './route';

const dbAvailable = await isDbAvailable();

function usersRequest(method: string, token: string | undefined, body?: unknown) {
  return new NextRequest('http://localhost/api/users', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(token ? { cookie: `session_token=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

describe.skipIf(!dbAvailable)('GET/POST /api/users (integration)', () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    if (createdEmails.length === 0) return;
    const db = await getDb();
    await db.getRepository('User').createQueryBuilder().delete().where('email IN (:...emails)', { emails: createdEmails }).execute();
    createdEmails.length = 0;
  });

  it('creates a user as admin', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const email = `new-user-${Date.now()}@example.com`;
      createdEmails.push(email);

      const response = await POST(
        usersRequest('POST', token, { email, password: 'password123', nom: 'New User', roles: ['admin'] }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('rejects creation by a non-admin (arbitre)', async () => {
    const { token, cleanup } = await createTestUserAndSession('arbitre');
    try {
      const response = await POST(
        usersRequest('POST', token, { email: `forbidden-${Date.now()}@example.com`, password: 'password123', nom: 'X', roles: ['admin'] }),
      );
      expect(response.status).toBe(403);
    } finally {
      await cleanup();
    }
  });

  it('rejects a duplicate email', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const email = `dup-user-${Date.now()}@example.com`;
      createdEmails.push(email);

      await POST(usersRequest('POST', token, { email, password: 'password123', nom: 'First', roles: ['admin'] }));
      const secondResponse = await POST(
        usersRequest('POST', token, { email, password: 'password123', nom: 'Second', roles: ['admin'] }),
      );
      expect(secondResponse.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('never returns passwordHash in the user list', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    try {
      const response = await GET(usersRequest('GET', token));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.users)).toBe(true);
      for (const user of body.users) {
        expect(user.passwordHash).toBeUndefined();
      }
    } finally {
      await cleanup();
    }
  });
});
