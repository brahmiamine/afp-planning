import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import type { UserEntity } from '@/lib/db/schemas';
import { backfillUnclaimedProfiles } from './unclaimed-profiles';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('migration 0012 — backfillUnclaimedProfiles (issue #204)', () => {
  it('marque activés les comptes à email réel, préserve les profils techniques, et se rejoue sans effet', async () => {
    const db = await getDb();
    const userRepo = db.getRepository<UserEntity>('User');
    const tag = randomBytes(6).toString('hex');
    const base = {
      clubId: `test-club-${tag}`,
      passwordHash: 'hash',
      planningFunctions: [] as string[],
      active: true,
      // Lignes simulées « pré-migration » : claimedAt absent.
      claimedAt: null,
      accessRole: 'dirigeant',
    };
    const realAccount = await userRepo.save({
      ...base,
      email: `claimed-${tag}@example.com`,
      nom: 'Compte Réel',
      icalToken: `ical-real-${tag}`,
    });
    const placeholder = await userRepo.save({
      ...base,
      email: `profil.${tag}.officiel@sans-acces.local`,
      nom: 'Profil Technique',
      planningFunctions: ['arbitre_club'],
      icalToken: `ical-placeholder-${tag}`,
    });

    try {
      await backfillUnclaimedProfiles(db);

      const realAfter = await userRepo.findOneBy({ id: realAccount.id });
      const placeholderAfter = await userRepo.findOneBy({ id: placeholder.id });
      expect(realAfter?.claimedAt).not.toBeNull();
      expect(placeholderAfter?.claimedAt).toBeNull();

      // Rejouable : la seconde exécution ne réécrit aucune ligne.
      const firstClaimedAt = realAfter?.claimedAt;
      await backfillUnclaimedProfiles(db);
      const realSecondPass = await userRepo.findOneBy({ id: realAccount.id });
      expect(new Date(realSecondPass?.claimedAt as Date).getTime())
        .toBe(new Date(firstClaimedAt as Date).getTime());
      expect((await userRepo.findOneBy({ id: placeholder.id }))?.claimedAt).toBeNull();
    } finally {
      await userRepo.delete({ id: realAccount.id });
      await userRepo.delete({ id: placeholder.id });
    }
  });
});
