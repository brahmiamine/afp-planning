import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { readAppSettings } from '@/lib/settings-store';
import { GET, PUT } from './route';

const dbAvailable = await isDbAvailable();
const createdClubIds: string[] = [];

function settingsRequest(method: 'GET' | 'PUT', token: string, body?: unknown) {
  return new NextRequest('http://localhost/api/settings', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      cookie: `session_token=${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

describe.skipIf(!dbAvailable)('/api/settings scraping isolation (integration)', () => {
  afterEach(async () => {
    if (createdClubIds.length === 0) return;
    const db = await getDb();
    await db
      .getRepository('ClubTenant')
      .createQueryBuilder()
      .delete()
      .where('id IN (:...ids)', { ids: createdClubIds })
      .execute();
    createdClubIds.length = 0;
  });

  it('does not expose or allow a club admin to modify platform-owned scraping settings', async () => {
    const clubId = `settings-scraping-${Date.now()}`;
    createdClubIds.push(clubId);
    const { token, cleanup } = await createTestUserAndSession('admin', { clubId });

    try {
      const db = await getDb();
      await readAppSettings(db, clubId);
      await db.getRepository('ClubTenant').update(
        { id: clubId },
        {
          matchesUrlKey: 'platform-controlled-source',
          scraperClubName: 'Platform Controlled Club',
        },
      );

      const getResponse = await GET(settingsRequest('GET', token));
      expect(getResponse.status).toBe(200);
      const visibleSettings = await getResponse.json();
      expect(visibleSettings.matchesUrlKey).toBe('');
      expect(visibleSettings.scraperClubName).toBe('');

      const putResponse = await PUT(
        settingsRequest('PUT', token, {
          clubName: 'Club Admin Branding',
          matchesUrlKey: 'attempted-club-override',
          scraperClubName: 'Attempted Club Override',
        }),
      );
      expect(putResponse.status).toBe(200);
      const putBody = await putResponse.json();
      expect(putBody.settings.matchesUrlKey).toBe('');
      expect(putBody.settings.scraperClubName).toBe('');

      const storedTenant = await db.getRepository('ClubTenant').findOneByOrFail({ id: clubId });
      expect(storedTenant.matchesUrlKey).toBe('platform-controlled-source');
      expect(storedTenant.scraperClubName).toBe('Platform Controlled Club');
    } finally {
      await cleanup();
    }
  });
});
