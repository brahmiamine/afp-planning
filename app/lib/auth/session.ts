import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { UserEntity, UserSessionEntity } from '@/lib/db/schemas';
import { normalizeRoles, UserRole } from './roles';
import type { OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

export interface SessionRevocationEvent {
  sessionToken?: string;
  userId: number;
}

type SessionRevocationListener = (event: SessionRevocationEvent) => void;

declare global {
  var __afpSessionRevocationListeners: Set<SessionRevocationListener> | undefined;
}

function sessionRevocationListeners(): Set<SessionRevocationListener> {
  globalThis.__afpSessionRevocationListeners ??= new Set();
  return globalThis.__afpSessionRevocationListeners;
}

function publishSessionRevocation(event: SessionRevocationEvent): void {
  for (const listener of sessionRevocationListeners()) {
    try {
      listener(event);
    } catch {
      console.error('Session revocation listener failed');
    }
  }
}

export function onSessionRevocation(listener: SessionRevocationListener): () => void {
  sessionRevocationListeners().add(listener);
  return () => {
    sessionRevocationListeners().delete(listener);
  };
}

export type NotifyChannel = 'push' | 'email' | 'both';

export function isNotifyChannel(value: unknown): value is NotifyChannel {
  return value === 'push' || value === 'email' || value === 'both';
}

export { SESSION_COOKIE_NAME } from './constants';

function getSessionTtlMs(): number {
  const rawDays = process.env.SESSION_TTL_DAYS;
  const days = rawDays ? Number.parseInt(rawDays, 10) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return safeDays * 24 * 60 * 60 * 1000;
}

function primaryRole(roles: UserRole[]): UserRole {
  if (roles.includes('admin')) return 'admin';
  return roles[0]!;
}

export interface SessionUser {
  id: number;
  clubId: string;
  email: string;
  nom: string;
  roles: UserRole[];
  /** Alias de transition. `roles` reste la source de vérité. */
  role: UserRole;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  active: boolean;
  icalToken: string;
  notifyChannel: NotifyChannel;
}

function toSessionUser(user: UserEntity): SessionUser | null {
  const roles = normalizeRoles(user.roles);
  if (roles.length === 0) {
    return null;
  }

  return {
    id: user.id,
    clubId: user.clubId || process.env.APP_CLUB_ID || 'afp',
    email: user.email,
    nom: user.nom,
    roles,
    role: primaryRole(roles),
    telephone: user.telephone ?? null,
    indisponibilites: user.indisponibilites ?? null,
    active: user.active,
    icalToken: user.icalToken,
    notifyChannel: isNotifyChannel(user.notifyChannel) ? user.notifyChannel : 'push',
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
    publishSessionRevocation({ sessionToken: token, userId: session.userId });
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
  publishSessionRevocation({ userId });
}
