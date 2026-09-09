import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { hashPassword } from '@/lib/auth/password';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function loginRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe.skipIf(!dbAvailable)('POST /api/auth/login (integration)', () => {
  const email = `login-test-${Date.now()}@example.com`;
  let userId: number;

  afterEach(async () => {
    if (userId) {
      const db = await getDb();
      await db.getRepository('UserSession').createQueryBuilder().delete().where('userId = :userId', { userId }).execute();
      await db.getRepository('User').delete({ id: userId });
    }
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    const db = await getDb();
    const user = await db.getRepository<UserEntity>('User').save({
      email,
      passwordHash: await hashPassword('correct-password'),
      nom: 'Login Test',
      accessRole: 'admin',
      planningFunctions: [],
      active: true,
      claimedAt: new Date(),
      personLinks: [],
      icalToken: 'ical-login-test',
    });
    userId = user.id;

    const response = await POST(loginRequest({ email, password: 'correct-password' }));
    expect(response.status).toBe(200);
    expect(response.cookies.get('session_token')?.value).toBeTruthy();
  });

  it('rejects an incorrect password', async () => {
    const response = await POST(loginRequest({ email, password: 'wrong-password' }));
    expect(response.status).toBe(401);
  });

  it('rejects a login for an unclaimed profile, even with a known password (issue #204)', async () => {
    const db = await getDb();
    const placeholderEmail = `profil-${Date.now()}@sans-acces.local`;
    const placeholder = await db.getRepository<UserEntity>('User').save({
      clubId: `test-club-${Date.now()}`,
      email: placeholderEmail,
      passwordHash: await hashPassword('known-password-123'),
      nom: 'Profil Sans Accès',
      accessRole: 'dirigeant',
      planningFunctions: ['arbitre_club'],
      active: true,
      // Profil créé par un référentiel de fonction : jamais activé, pas de session.
      claimedAt: null,
      icalToken: `ical-${Date.now()}`,
    });
    try {
      const response = await POST(loginRequest({ email: placeholderEmail, password: 'known-password-123' }));
      expect(response.status).toBe(401);
      expect(response.cookies.get('session_token')).toBeUndefined();
    } finally {
      await db.getRepository('User').delete({ id: placeholder.id });
    }
  });

  it('rejects a login for an inactive user', async () => {
    const db = await getDb();
    await db.getRepository<UserEntity>('User').update({ id: userId }, { active: false });

    const response = await POST(loginRequest({ email, password: 'correct-password' }));
    expect(response.status).toBe(401);
  });
});
