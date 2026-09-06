import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { ClubTenantEntity } from './schemas';
import { isClubTenantActive } from './club-tenants';

function dbWithTenant(tenant: ClubTenantEntity | null): DataSource {
  return {
    getRepository: () => ({
      findOneBy: async () => tenant,
    }),
  } as unknown as DataSource;
}

describe('isClubTenantActive (issue #88)', () => {
  it('is false for a club explicitly deactivated from the platform space', async () => {
    const db = dbWithTenant({ id: 'afp', active: false } as ClubTenantEntity);
    expect(await isClubTenantActive(db, 'afp')).toBe(false);
  });

  it('is true for a club explicitly marked active', async () => {
    const db = dbWithTenant({ id: 'afp', active: true } as ClubTenantEntity);
    expect(await isClubTenantActive(db, 'afp')).toBe(true);
  });

  it('defaults to true when no club_tenants row exists (legacy single-tenant install)', async () => {
    const db = dbWithTenant(null);
    expect(await isClubTenantActive(db, 'afp')).toBe(true);
  });
});
