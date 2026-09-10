import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import type { PasswordResetTokenEntity, UserEntity } from '@/lib/db/schemas';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { verifyPassword } from '@/lib/auth/password';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function confirmRequest(token: string, newPassword: string) {
  return new NextRequest('http://localhost/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createResetToken(userId: number, overrides?: Partial<PasswordResetTokenEntity>) {
  const db = await getDb();
  const repo = db.getRepository<PasswordResetTokenEntity>('PasswordResetToken');
  const rawToken = randomBytes(32).toString('hex');
  await repo.save({
    tokenHash: hashToken(rawToken),
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    ...overrides,
  });
  return rawToken;
}

describe.skipIf(!dbAvailable)('POST /api/auth/password-reset/confirm (issue #271)', () => {
  const cleanupUserIds: number[] = [];
  const cleanupTokenHashes: string[] = [];

  afterEach(async () => {
    const db = await getDb();
    for (const tokenHash of cleanupTokenHashes) {
      await db.getRepository('PasswordResetToken').delete({ tokenHash });
    }
    cleanupTokenHashes.length = 0;
    for (const id of cleanupUserIds) {
      await db.getRepository('UserSession').createQueryBuilder().delete().where('userId = :id', { id }).execute();
      await db.getRepository('User').delete({ id });
    }
    cleanupUserIds.length = 0;
  });

  it('sets the new password and consumes the token exactly once', async () => {
    const account = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    cleanupUserIds.push(account.user.id);
    const rawToken = await createResetToken(account.user.id);
    cleanupTokenHashes.push(hashToken(rawToken));

    const response = await POST(confirmRequest(rawToken, 'nouveauMotDePasse123'));
    expect(response.status).toBe(200);

    const db = await getDb();
    const reloaded = await db.getRepository<UserEntity>('User').findOneBy({ id: account.user.id });
    expect(await verifyPassword('nouveauMotDePasse123', reloaded!.passwordHash)).toBe(true);

    const reused = await POST(confirmRequest(rawToken, 'autreMotDePasse456'));
    expect(reused.status).toBe(410);
  });

  it('rejects an expired token', async () => {
    const account = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    cleanupUserIds.push(account.user.id);
    const rawToken = await createResetToken(account.user.id, { expiresAt: new Date(Date.now() - 1000) });
    cleanupTokenHashes.push(hashToken(rawToken));

    const response = await POST(confirmRequest(rawToken, 'nouveauMotDePasse123'));
    expect(response.status).toBe(410);
  });

  it("exactement une confirmation réussit quand deux requêtes concurrentes utilisent le même jeton", async () => {
    const account = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    cleanupUserIds.push(account.user.id);
    const rawToken = await createResetToken(account.user.id);
    cleanupTokenHashes.push(hashToken(rawToken));

    const [first, second] = await Promise.all([
      POST(confirmRequest(rawToken, 'motDePasseA111')),
      POST(confirmRequest(rawToken, 'motDePasseB222')),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 410]);

    const winningPassword = first.status === 200 ? 'motDePasseA111' : 'motDePasseB222';
    const db = await getDb();
    const reloaded = await db.getRepository<UserEntity>('User').findOneBy({ id: account.user.id });
    expect(await verifyPassword(winningPassword, reloaded!.passwordHash)).toBe(true);
  });
});
