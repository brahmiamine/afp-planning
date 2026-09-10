import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import type { InvitationEntity } from '@/lib/db/schemas';
import { hashInvitationToken } from '@/lib/auth/invitation-tokens';
import { hashExistingInvitationTokens } from './invitation-token-hash';

const dbAvailable = await isDbAvailable();

describe('migration 0013 — base neuve', () => {
  it("ignore le backfill lorsque la table invitations n'existe pas encore", async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    const affected = await hashExistingInvitationTokens({ query } as unknown as Awaited<ReturnType<typeof getDb>>);

    expect(affected).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('information_schema.tables'));
  });
});

describe.skipIf(!dbAvailable)('migration 0013 — hashExistingInvitationTokens (issue #271)', () => {
  it('rehache un ancien jeton brut sans invalider le lien, et se rejoue sans effet', async () => {
    const db = await getDb();
    const repo = db.getRepository<InvitationEntity>('Invitation');
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const { user, cleanup } = await createTestUserAndSession('admin', { clubId });
    // Ligne simulée « pré-migration » : id = jeton brut, comme avant l'issue #271.
    const rawToken = randomBytes(24).toString('hex');
    const invitation = await repo.save({
      id: rawToken,
      clubId,
      email: null,
      pendingEmailKey: null,
      accessRole: 'dirigeant',
      planningFunctions: [],
      personNom: null,
      personType: null,
      personId: null,
      createdByUserId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      usedAt: null,
      usedByUserId: null,
      createdAt: new Date(),
    });

    try {
      const migrated = await hashExistingInvitationTokens(db);
      expect(migrated).toBeGreaterThanOrEqual(1);

      const expectedHash = hashInvitationToken(rawToken);
      const rehashed = await repo.findOneBy({ id: expectedHash });
      expect(rehashed).not.toBeNull();
      expect(await repo.findOneBy({ id: rawToken })).toBeNull();

      // Rejouable : la seconde exécution ne retouche pas une ligne déjà hachée
      // (déjà 64 caractères), elle ne re-hache donc pas l'empreinte elle-même.
      await hashExistingInvitationTokens(db);
      expect(await repo.findOneBy({ id: expectedHash })).not.toBeNull();
    } finally {
      await repo.delete({ id: hashInvitationToken(rawToken) });
      await repo.delete({ id: invitation.id });
      await cleanup();
    }
  });
});
