import { describe, expect, it, vi } from 'vitest';
import type { ClubTenantEntity } from '@/lib/db/schemas';

let tenant: Partial<ClubTenantEntity> | null = null;
vi.mock('@/lib/db', () => ({
  getDb: async () => ({
    getRepository: () => ({ findOneBy: async () => tenant }),
  }),
}));

const { assertScrapedClubIdentity, getScraperSourceConfig } = await import('./run-scraper');

describe('assertScrapedClubIdentity (issue #221)', () => {
  it('bloque un club scrapé différent même quand scraperClubName serait vide', () => {
    // Avant #221, une chaîne vide désactivait silencieusement toute vérification.
    expect(() => assertScrapedClubIdentity(
      { matchesUrlKey: 'afp', scraperClubName: '' },
      { club: { name: 'Un autre club' } } as never,
    )).toThrow('ne correspond pas au club configuré');
  });

  it('accepte une correspondance exacte (à la casse/accents près)', () => {
    expect(() => assertScrapedClubIdentity(
      { matchesUrlKey: 'afp', scraperClubName: 'Académie Football Paris 18' },
      { club: { name: 'academie football paris 18' } } as never,
    )).not.toThrow();
  });
});

describe('getScraperSourceConfig (issue #221)', () => {
  it("refuse un club dont matchesUrlKey est configuré sans scraperClubName", async () => {
    tenant = { matchesUrlKey: 'afp', scraperClubName: '', active: true } as ClubTenantEntity;
    await expect(getScraperSourceConfig('afp')).rejects.toThrow('scraperClubName non configuré');
  });

  it('accepte un club correctement configuré', async () => {
    tenant = { matchesUrlKey: 'afp', scraperClubName: 'AFP', active: true } as ClubTenantEntity;
    await expect(getScraperSourceConfig('afp')).resolves.toEqual({
      matchesUrlKey: 'afp',
      scraperClubName: 'AFP',
    });
  });
});
