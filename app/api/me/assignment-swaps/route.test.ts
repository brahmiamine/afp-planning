import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { savePlanningRecord } from '@/lib/planning/records';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

function request(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

describe.skipIf(!dbAvailable)('GET /api/me/assignment-swaps — visibilité avant première publication (issue #147)', () => {
  it('ne révèle pas une affectation dont le club n’a jamais publié le planning global', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const encadrantNom = `Encadrant Test ${randomBytes(4).toString('hex')}`;
    const { token, user, cleanup } = await createTestUserAndSession('encadrant', { clubId, nom: encadrantNom });
    const eventId = `entrainement-${randomBytes(4).toString('hex')}`;
    const db = await getDb();
    const publishedRecordId = `published-planning:${clubId}`;

    try {
      // Entraînement dont le champ live dit déjà 'published', mais dont le club n'a jamais
      // exécuté de publication globale (aucun snapshot published-planning).
      await db.getRepository('Entrainement').save({
        id: eventId,
        clubId,
        date: '20/09/2026',
        time: '10:00',
        payload: {
          id: eventId,
          type: 'entrainement',
          date: '20/09/2026',
          time: '10:00',
          lieu: 'Terrain test',
          planningStatus: 'published',
          encadrants: [{ nom: encadrantNom, numero: '', personId: user.id, personType: 'encadrant', status: 'accepted' }],
        },
      });

      const before = await GET(request(
        `http://localhost/api/me/assignment-swaps?eventType=entrainement&eventId=${eventId}&role=encadrant`,
        token,
      ));
      expect(before.status).toBe(404);

      // Une fois réellement publié, l'affectation redevient visible pour l'échange.
      await savePlanningRecord(db, {
        id: publishedRecordId,
        clubId,
        kind: 'published-planning',
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: 0,
          events: [{
            eventId,
            eventType: 'entrainement',
            title: 'Entraînement test',
            date: '20/09/2026',
            time: '10:00',
            durationMinutes: 90,
            location: 'Terrain test',
            planningStatus: 'published',
            event: { id: eventId, type: 'entrainement', date: '20/09/2026', time: '10:00', lieu: 'Terrain test', planningStatus: 'published' },
            extras: null,
            assignments: {
              arbitre: [],
              encadrant: [{ nom: encadrantNom, numero: '', personId: user.id, personType: 'encadrant', status: 'accepted' }],
              accompagnateur: [],
            },
          }],
        },
      });

      const after = await GET(request(
        `http://localhost/api/me/assignment-swaps?eventType=entrainement&eventId=${eventId}&role=encadrant`,
        token,
      ));
      expect(after.status).toBe(200);
    } finally {
      await db.getRepository('Entrainement').delete({ id: eventId, clubId });
      await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [publishedRecordId, clubId]);
      await cleanup();
    }
  });
});
