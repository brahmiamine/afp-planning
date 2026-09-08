import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { updateAppSettings } from '@/lib/settings-store';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

function request(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

describe.skipIf(!dbAvailable)('GET /api/planning/events/[eventType]/[eventId]/reports — feature flag (issue #149)', () => {
  it('applique la garde du module Collaboration, comme le décrit son intitulé en configuration', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const { token, cleanup } = await createTestUserAndSession('admin', { clubId });
    const eventId = `entrainement-${randomBytes(4).toString('hex')}`;
    const db = await getDb();

    try {
      await db.getRepository('Entrainement').save({
        id: eventId,
        clubId,
        date: '20/09/2026',
        time: '10:00',
        payload: { id: eventId, type: 'entrainement', date: '20/09/2026', time: '10:00', lieu: 'Terrain test', planningStatus: 'draft', encadrants: [] },
      });

      await updateAppSettings(db, clubId, (current) => ({ ...current, features: { ...current.features, collaboration: false } }));
      const disabled = await GET(request(`http://localhost/api/planning/events/entrainement/${eventId}/reports`, token), {
        params: { eventType: 'entrainement', eventId },
      });
      expect(disabled).toBeDefined();
      expect(disabled!.status).toBe(409);

      await updateAppSettings(db, clubId, (current) => ({ ...current, features: { ...current.features, collaboration: true } }));
      const enabled = await GET(request(`http://localhost/api/planning/events/entrainement/${eventId}/reports`, token), {
        params: { eventType: 'entrainement', eventId },
      });
      expect(enabled).toBeDefined();
      expect(enabled!.status).toBe(200);
    } finally {
      await db.getRepository('Entrainement').delete({ id: eventId, clubId });
      await db.getRepository('ClubTenant').delete({ id: clubId });
      await cleanup();
    }
  });
});
