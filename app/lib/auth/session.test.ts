import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { ClubTenantEntity, UserEntity } from '@/lib/db/schemas';
import { hashPassword } from './password';
import {
  createSession,
  getSessionUser,
  onSessionRevocation,
  revokeSession,
  revokeAllSessionsForUser,
  type SessionRevocationEvent,
} from './session';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('session (integration)', () => {
  let userId: number;

  beforeAll(async () => {
    const db = await getDb();
    const userRepo = db.getRepository<UserEntity>('User');
    const user = await userRepo.save({
      email: `session-test-${Date.now()}@example.com`,
      passwordHash: await hashPassword('irrelevant-password'),
      nom: 'Session Test User',
      roles: ['admin'],
      active: true,
      personLinks: [],
      icalToken: `ical-${Date.now()}`,
    });
    userId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    await db.getRepository('UserSession').createQueryBuilder().delete().where('userId = :userId', { userId }).execute();
    await db.getRepository('User').delete({ id: userId });
  });

  it('creates a session and resolves it back to the user', async () => {
    const { token } = await createSession(userId);
    const sessionUser = await getSessionUser(token);
    expect(sessionUser?.id).toBe(userId);
  });

  it('returns null for a revoked session', async () => {
    const { token } = await createSession(userId);
    const events: SessionRevocationEvent[] = [];
    const unsubscribe = onSessionRevocation((event) => events.push(event));
    try {
      await revokeSession(token);
      const sessionUser = await getSessionUser(token);
      expect(sessionUser).toBeNull();
      expect(events).toContainEqual({ sessionToken: token, userId });
    } finally {
      unsubscribe();
    }
  });

  it('returns null after revokeAllSessionsForUser', async () => {
    const { token } = await createSession(userId);
    await revokeAllSessionsForUser(userId);
    const sessionUser = await getSessionUser(token);
    expect(sessionUser).toBeNull();
  });

  it('returns null for a malformed token', async () => {
    const sessionUser = await getSessionUser('not-a-real-token');
    expect(sessionUser).toBeNull();
  });

  it('returns null for an existing session when its club tenant is inactive (issue #88)', async () => {
    const db = await getDb();
    const clubId = `inactive-session-${Date.now()}`;
    const tenantRepo = db.getRepository<ClubTenantEntity>('ClubTenant');
    const userRepo = db.getRepository<UserEntity>('User');
    const tenant = await tenantRepo.save({ id: clubId, name: 'Inactive Session Club', active: true });
    const user = await userRepo.save({
      clubId,
      email: `inactive-session-${Date.now()}@example.com`,
      passwordHash: await hashPassword('irrelevant-password'),
      nom: 'Inactive Club User',
      roles: ['admin'],
      active: true,
      personLinks: [],
      icalToken: `ical-inactive-${Date.now()}`,
    });
    const { token } = await createSession(user.id);
    try {
      tenant.active = false;
      await tenantRepo.save(tenant);
      expect(await getSessionUser(token)).toBeNull();
    } finally {
      await db.getRepository('UserSession').createQueryBuilder().delete().where('userId = :userId', { userId: user.id }).execute();
      await userRepo.delete({ id: user.id });
      await tenantRepo.delete({ id: clubId });
    }
  });
});
