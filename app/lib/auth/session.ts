import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { UserEntity, UserSessionEntity } from '@/lib/db/schemas';
import { isUserRole, UserRole } from './roles';
import type { PersonType } from '@/types/match';

export { SESSION_COOKIE_NAME } from './constants';

function getSessionTtlMs(): number {
  const rawDays = process.env.SESSION_TTL_DAYS;
  const days = rawDays ? Number.parseInt(rawDays, 10) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return safeDays * 24 * 60 * 60 * 1000;
}

export interface SessionUser {
  id: number;
  email: string;
  nom: string;
  role: UserRole;
  personNom: string | null;
  personType: PersonType | null;
  personId: number | null;
  active: boolean;
  icalToken: string;
}

function isPersonType(value: string | null): value is PersonType {
  return value === 'officiel' || value === 'encadrant' || value === 'accompagnateur';
}

function toSessionUser(user: UserEntity): SessionUser | null {
  if (!isUserRole(user.role)) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    role: user.role,
    personNom: user.personNom,
    personType: isPersonType(user.personType) ? user.personType : null,
    personId: user.personId,
    active: user.active,
    icalToken: user.icalToken,
  };
}

export async function createSession(
  userId: number,
  meta?: { userAgent?: string | null; ipAddress?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const repo = db.getRepository<UserSessionEntity>('UserSession');

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + getSessionTtlMs());

  await repo.save({
    id: token,
    userId,
    expiresAt,
    revokedAt: null,
    userAgent: meta?.userAgent ?? null,
    ipAddress: meta?.ipAddress ?? null,
  });

  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const db = await getDb();
  const sessionRepo = db.getRepository<UserSessionEntity>('UserSession');
  const userRepo = db.getRepository<UserEntity>('User');

  const session = await sessionRepo.findOneBy({ id: token });
  if (!session || session.revokedAt !== null) {
    return null;
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const user = await userRepo.findOneBy({ id: session.userId });
  if (!user || !user.active) {
    return null;
  }

  return toSessionUser(user);
}

export async function revokeSession(token: string | undefined | null): Promise<void> {
  if (!token) {
    return;
  }
  const db = await getDb();
  const repo = db.getRepository<UserSessionEntity>('UserSession');
  const session = await repo.findOneBy({ id: token });
  if (session && session.revokedAt === null) {
    session.revokedAt = new Date();
    await repo.save(session);
  }
}

export async function revokeAllSessionsForUser(userId: number): Promise<void> {
  const db = await getDb();
  const repo = db.getRepository<UserSessionEntity>('UserSession');
  await repo
    .createQueryBuilder()
    .update()
    .set({ revokedAt: new Date() })
    .where('userId = :userId', { userId })
    .andWhere('revokedAt IS NULL')
    .execute();
}
