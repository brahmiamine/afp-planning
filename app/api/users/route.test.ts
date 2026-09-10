import { randomBytes } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import type { UserEntity } from '@/lib/db/schemas';
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
        usersRequest('POST', token, { email, password: 'password123', nom: 'New User', accessRole: 'admin', planningFunctions: [] }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('rejects creation by a non-admin (arbitre)', async () => {
    const { token, cleanup } = await createTestUserAndSession('dirigeant', undefined, ['arbitre_club']);
    try {
      const response = await POST(
        usersRequest('POST', token, { email: `forbidden-${Date.now()}@example.com`, password: 'password123', nom: 'X', accessRole: 'admin', planningFunctions: [] }),
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

      await POST(usersRequest('POST', token, { email, password: 'password123', nom: 'First', accessRole: 'admin', planningFunctions: [] }));
      const secondResponse = await POST(
        usersRequest('POST', token, { email, password: 'password123', nom: 'Second', accessRole: 'admin', planningFunctions: [] }),
      );
      expect(secondResponse.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  it('allows the same email to be used in two different clubs (issue #266)', async () => {
    const clubA = `test-club-a-${randomBytes(6).toString('hex')}`;
    const clubB = `test-club-b-${randomBytes(6).toString('hex')}`;
    const { token: tokenA, cleanup: cleanupA } = await createTestUserAndSession('admin', { clubId: clubA });
    const { token: tokenB, cleanup: cleanupB } = await createTestUserAndSession('admin', { clubId: clubB });
    try {
      const email = `dirigeant-multi-club-${randomBytes(6).toString('hex')}@example.com`;
      createdEmails.push(email);

      const firstResponse = await POST(
        usersRequest('POST', tokenA, { email, password: 'password123', nom: 'Dirigeant Club A', accessRole: 'admin', planningFunctions: [] }),
      );
      expect(firstResponse.status).toBe(200);

      // Même email, club différent : accepté — deux comptes indépendants, chacun
      // avec son propre mot de passe et profil (issue #266).
      const secondResponse = await POST(
        usersRequest('POST', tokenB, { email, password: 'un-autre-mot-de-passe', nom: 'Dirigeant Club B', accessRole: 'admin', planningFunctions: [] }),
      );
      expect(secondResponse.status).toBe(200);

      const db = await getDb();
      const accounts = await db.getRepository<UserEntity>('User').find({ where: { email } });
      expect(accounts).toHaveLength(2);
      const clubIds = accounts.map((account) => account.clubId).sort();
      expect(clubIds).toEqual([clubA, clubB].sort());
      // Deux lignes distinctes, pas un compte partagé entre les deux clubs.
      const ids = new Set(accounts.map((account) => account.id));
      expect(ids.size).toBe(2);
    } finally {
      await cleanupA();
      await cleanupB();
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
