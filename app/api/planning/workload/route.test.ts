import { randomBytes } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { savePlanningRecord } from '@/lib/planning/records';
import type { PlanningEventSnapshot } from '@/lib/planning/event-store';
import { GET } from './route';
import { POST as postEntrainement } from '@/app/api/entrainements/route';

const dbAvailable = await isDbAvailable();

function snapshot(overrides: Partial<PlanningEventSnapshot>): PlanningEventSnapshot {
  return {
    eventId: `evt-${randomBytes(4).toString('hex')}`,
    eventType: 'entrainement',
    title: 'Entraînement test',
    date: '15/09/2026',
    time: '18:00',
    durationMinutes: 90,
    location: 'Terrain A',
    planningStatus: 'published',
    event: { id: 'x', type: 'entrainement', date: '15/09/2026', time: '18:00', lieu: 'Terrain A', encadrants: [] } as unknown as PlanningEventSnapshot['event'],
    extras: null,
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    revision: 0,
    ...overrides,
  } as PlanningEventSnapshot;
}

describe.skipIf(!dbAvailable)('GET /api/planning/workload — planning publié, pas le brouillon (issue #216)', () => {
  const CLUB_ID = `test-club-${randomBytes(6).toString('hex')}`;
  const publishedId = `published-planning:${CLUB_ID}`;

  afterEach(async () => {
    const db = await getDb();
    await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [publishedId, CLUB_ID]);
    await db.query('DELETE FROM club_tenants WHERE id = ?', [CLUB_ID]);
  });

  it('reflète le planning publié et ignore une modification de brouillon non publiée', async () => {
    const db = await getDb();
    const { token, cleanup } = await createTestUserAndSession('admin', { clubId: CLUB_ID });
    let draftId: string | null = null;

    try {
      await savePlanningRecord(db, {
        id: publishedId,
        clubId: CLUB_ID,
        kind: 'published-planning',
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: 0,
          events: [
            snapshot({
              eventId: 'published-1',
              assignments: {
                arbitre: [],
                encadrant: [{ nom: 'Alice Publiée', numero: '', personType: 'encadrant', personId: 1, status: 'accepted' }],
                accompagnateur: [],
              },
            }),
          ],
        },
      });

      // Modification du planning de travail (brouillon) APRÈS publication : un nouvel
      // entraînement, jamais republié, avec un encadrant différent.
      const draftResponse = await postEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '10:00',
          lieu: 'Terrain brouillon',
          categorie: 'U13',
          encadrants: [{ nom: 'Bob Brouillon', numero: '' }],
        }),
      }));
      expect(draftResponse.status).toBe(200);
      draftId = (await draftResponse.json()).entrainement?.id ?? null;

      const response = await GET(new NextRequest('http://localhost/api/planning/workload', {
        headers: { cookie: `session_token=${token}` },
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      const names = (body.entries as Array<{ nom: string }>).map((entry) => entry.nom);

      // Le calcul doit refléter le snapshot publié (Alice)…
      expect(names).toContain('Alice Publiée');
      // … et ignorer la modification de brouillon non republiée (Bob) : avant #216,
      // la route lisait directement listPlanningEventSnapshots() (le brouillon live) et
      // aurait donc renvoyé Bob sans jamais montrer Alice.
      expect(names).not.toContain('Bob Brouillon');
    } finally {
      if (draftId) {
        await db.getRepository('Entrainement').delete({ id: draftId });
        await db.getRepository('MatchAuditLog').delete({ entityId: draftId });
      }
      await cleanup();
    }
  });
});
