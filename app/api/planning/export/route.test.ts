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

function snapshot(eventId: string, overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId,
    eventType: 'entrainement',
    title: `Entraînement ${eventId}`,
    date: '15/09/2026',
    time: '18:00',
    durationMinutes: 90,
    location: 'Terrain A',
    planningStatus: 'published',
    event: { id: eventId, type: 'entrainement', date: '15/09/2026', time: '18:00', lieu: 'Terrain A', encadrants: [] } as unknown as PlanningEventSnapshot['event'],
    extras: null,
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    revision: 0,
    ...overrides,
  } as PlanningEventSnapshot;
}

describe.skipIf(!dbAvailable)('GET /api/planning/export?format=json — source unique PDF/CSV (issue #214)', () => {
  const CLUB_ID = `test-club-${randomBytes(6).toString('hex')}`;
  const publishedId = `published-planning:${CLUB_ID}`;

  afterEach(async () => {
    const db = await getDb();
    await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [publishedId, CLUB_ID]);
    await db.query('DELETE FROM club_tenants WHERE id = ?', [CLUB_ID]);
  });

  it('renvoie le planning publié par défaut, exclut les annulés, et ignore le brouillon sans includeDrafts', async () => {
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
            snapshot('kept'),
            snapshot('hidden', { planningStatus: 'cancelled' }),
          ],
        },
      });

      const draftResponse = await postEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '20/09/2026',
          time: '10:00',
          lieu: 'Terrain brouillon',
          categorie: 'U13',
          encadrants: [],
        }),
      }));
      draftId = (await draftResponse.json()).entrainement?.id ?? null;

      const response = await GET(new NextRequest('http://localhost/api/planning/export?format=json', {
        headers: { cookie: `session_token=${token}` },
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      const ids = (body.events as Array<{ id?: string }>).map((event) => event.id);

      expect(ids).toContain('kept');
      expect(ids).not.toContain('hidden');
      expect(ids).not.toContain(draftId);
      expect(body.events).toHaveLength(1);
    } finally {
      if (draftId) {
        await db.getRepository('Entrainement').delete({ id: draftId });
        await db.getRepository('MatchAuditLog').delete({ entityId: draftId });
      }
      await cleanup();
    }
  });
});
