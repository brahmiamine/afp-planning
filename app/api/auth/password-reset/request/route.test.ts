import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { PasswordResetTokenEntity } from '@/lib/db/schemas';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function requestReset(body: unknown) {
  return new NextRequest('http://localhost/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe.skipIf(!dbAvailable)('POST /api/auth/password-reset/request (issue #286)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('rejects a missing email', async () => {
    const response = await POST(requestReset({}));
    expect(response.status).toBe(400);
  });

  it('returns a generic success for an unknown address and does not leak a reset URL', async () => {
    const response = await POST(requestReset({ email: `unknown-${randomBytes(4).toString('hex')}@example.com` }));
    expect(response.status).toBe(200);
    const body = await response.json() as { success: boolean; resetUrl?: string };
    expect(body.success).toBe(true);
    expect(body.resetUrl).toBeUndefined();
  });

  it('issues a token for an activated account and hides unclaimed profiles', async () => {
    const claimed = await createTestUserAndSession('dirigeant', {}, ['arbitre_club']);
    const unclaimed = await createTestUserAndSession(
      'dirigeant',
      { claimedAt: null, email: `profil-${randomBytes(4).toString('hex')}@sans-acces.local` },
      ['encadrant'],
    );
    cleanups.push(claimed.cleanup, unclaimed.cleanup, async () => {
      const db = await getDb();
      await db.getRepository('PasswordResetToken').delete({ userId: claimed.user.id });
      await db.getRepository('PasswordResetToken').delete({ userId: unclaimed.user.id });
    });

    const claimedResponse = await POST(requestReset({ email: claimed.user.email }));
    expect(claimedResponse.status).toBe(200);
    const claimedBody = await claimedResponse.json() as { success: boolean; resetUrl?: string };
    expect(claimedBody.success).toBe(true);
    expect(claimedBody.resetUrl).toMatch(/\/reinitialiser\/[a-f0-9]{64}$/);

    const db = await getDb();
    const claimedTokens = await db.getRepository<PasswordResetTokenEntity>('PasswordResetToken').findBy({
      userId: claimed.user.id,
    });
    expect(claimedTokens).toHaveLength(1);

    const unclaimedResponse = await POST(requestReset({ email: unclaimed.user.email }));
    expect(unclaimedResponse.status).toBe(200);
    const unclaimedBody = await unclaimedResponse.json() as { success: boolean; resetUrl?: string };
    expect(unclaimedBody.success).toBe(true);
    expect(unclaimedBody.resetUrl).toBeUndefined();
    const unclaimedTokens = await db.getRepository<PasswordResetTokenEntity>('PasswordResetToken').findBy({
      userId: unclaimed.user.id,
    });
    expect(unclaimedTokens).toHaveLength(0);
  });
});
