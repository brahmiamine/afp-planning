import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('GET /api/ical/[token] — club désactivé (issue #213)', () => {
  it('refuse un jeton iCal par ailleurs valide une fois le club désactivé, sans distinguer le motif', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const { user, cleanup } = await createTestUserAndSession('dirigeant', { clubId }, ['arbitre_club']);
    const db = await getDb();

    try {
      const workingResponse = await GET(
        new Request(`http://localhost/api/ical/${user.icalToken}`) as never,
        { params: { token: user.icalToken } },
      );
      expect(workingResponse.status).toBe(200);

      await db.getRepository('ClubTenant').save({ id: clubId, name: 'Club test désactivé', active: false });

      const disabledResponse = await GET(
        new Request(`http://localhost/api/ical/${user.icalToken}`) as never,
        { params: { token: user.icalToken } },
      );
      expect(disabledResponse.status).toBe(404);
      const disabledBody = await disabledResponse.json();

      const invalidResponse = await GET(
        new Request('http://localhost/api/ical/jeton-inexistant') as never,
        { params: { token: 'jeton-inexistant' } },
      );
      const invalidBody = await invalidResponse.json();

      // Même statut, même message : un client ne doit pas pouvoir distinguer
      // « club désactivé » de « jeton invalide ».
      expect(disabledResponse.status).toBe(invalidResponse.status);
      expect(disabledBody.error).toBe(invalidBody.error);
    } finally {
      await db.getRepository('ClubTenant').delete({ id: clubId });
      await cleanup();
    }
  });
});
