import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { ClubTenantEntity, UserEntity } from '@/lib/db/schemas';
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
      roles: ['admin'],
      active: true,
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

  it('rejects a login for an inactive user', async () => {
    const db = await getDb();
    await db.getRepository<UserEntity>('User').update({ id: userId }, { active: false });

    const response = await POST(loginRequest({ email, password: 'correct-password' }));
    expect(response.status).toBe(401);
  });

  it('rejects a login when the user club tenant is inactive (issue #88)', async () => {
    const db = await getDb();
    const clubId = `inactive-login-${Date.now()}`;
    const inactiveEmail = `inactive-login-${Date.now()}@example.com`;
    const tenantRepo = db.getRepository<ClubTenantEntity>('ClubTenant');
    const userRepo = db.getRepository<UserEntity>('User');
    const tenant = await tenantRepo.save({ id: clubId, name: 'Inactive Login Club', active: false });
    const user = await userRepo.save({
      clubId,
      email: inactiveEmail,
      passwordHash: await hashPassword('correct-password'),
      nom: 'Inactive Login User',
      roles: ['admin'],
      active: true,
      personLinks: [],
      icalToken: `ical-inactive-login-${Date.now()}`,
    });
    try {
      const response = await POST(loginRequest({ email: inactiveEmail, password: 'correct-password' }));
      expect(response.status).toBe(401);
      expect(response.cookies.get('session_token')).toBeUndefined();
    } finally {
      await db.getRepository('UserSession').createQueryBuilder().delete().where('userId = :userId', { userId: user.id }).execute();
      await userRepo.delete({ id: user.id });
      await tenantRepo.delete({ id: tenant.id });
    }
  });
});
