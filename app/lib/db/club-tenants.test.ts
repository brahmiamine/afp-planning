import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { ClubTenantEntity } from './schemas';
import { isClubTenantActive } from './club-tenants';

function dbWithTenant(tenant: ClubTenantEntity | null): DataSource {
  return {
    getRepository: () => ({ findOneBy: async () => tenant }),
  } as unknown as DataSource;
}

describe('isClubTenantActive (issue #88)', () => {
  it('rejects an explicitly inactive tenant', async () => {
    expect(await isClubTenantActive(
      dbWithTenant({ id: 'afp', active: false } as ClubTenantEntity),
      'afp',
    )).toBe(false);
  });

  it('accepts an explicitly active tenant', async () => {
    expect(await isClubTenantActive(
      dbWithTenant({ id: 'afp', active: true } as ClubTenantEntity),
      'afp',
    )).toBe(true);
  });

  it('keeps legacy single-tenant installs active when no row exists', async () => {
    expect(await isClubTenantActive(dbWithTenant(null), 'afp')).toBe(true);
  });
});
