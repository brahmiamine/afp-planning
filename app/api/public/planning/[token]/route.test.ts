import { randomBytes } from 'node:crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getDb } from '@/lib/db';
import { savePlanningRecord } from '@/lib/planning/records';
import { hashShareToken, newShareToken, type PublicShareScope } from '@/lib/planning/public-share';
import type { PlanningEventSnapshot } from '@/lib/planning/event-store';
import { GET } from './route';

const dbAvailable = await isDbAvailable();
// Club synthétique et unique à ce test : `published-planning:{clubId}` est un singleton par
// club (INSERT ... ON DUPLICATE KEY UPDATE), donc réutiliser le vrai APP_CLUB_ID écraserait —
// puis, en afterEach, supprimerait — le planning publié réel d'un développeur faisant tourner
// `pnpm test` contre sa base locale documentée (cf. TESTING.md).
const CLUB_ID = `test-club-${randomBytes(6).toString('hex')}`;

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
    assignments: { officiel: [], encadrant: [], accompagnateur: [] } as unknown as PlanningEventSnapshot['assignments'],
    ...overrides,
  };
}

describe.skipIf(!dbAvailable)('GET /api/public/planning/[token] (integration)', () => {
  const cleanupIds: string[] = [];

  afterEach(async () => {
    const db = await getDb();
    for (const id of cleanupIds) {
      // Suppression explicitement scopée à CLUB_ID (et non au club courant/par défaut) :
      // ce test manipule un club synthétique isolé, jamais celui de l'environnement local.
      await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [id, CLUB_ID]);
    }
    cleanupIds.length = 0;

    // planningFeatureGuard() crée le tenant à la première lecture du partage public.
    // Le supprimer après ses enregistrements dépendants évite d'accumuler des clubs de test
    // visibles dans l'administration et parcourus ensuite par les tâches cron.
    await db.query('DELETE FROM club_tenants WHERE id = ?', [CLUB_ID]);
  });

  it('excludes cancelled events from the published snapshot', async () => {
    const db = await getDb();

    const publishedId = `published-planning:${CLUB_ID}`;
    cleanupIds.push(publishedId);
    await savePlanningRecord(db, {
      id: publishedId,
      clubId: CLUB_ID,
      kind: 'published-planning',
      payload: {
        schemaVersion: 1,
        publishedAt: new Date().toISOString(),
        publishedByUserId: 0,
        events: [
          snapshot({ eventId: 'kept', planningStatus: 'published' }),
          snapshot({ eventId: 'hidden', planningStatus: 'cancelled', title: 'Match annulé' }),
        ],
      },
    });

    const token = newShareToken();
    const shareId = `public-share:${randomBytes(8).toString('hex')}`;
    cleanupIds.push(shareId);
    const scope: PublicShareScope = { eventTypes: [], fromDate: null, toDate: null };
    await savePlanningRecord(db, {
      id: shareId,
      clubId: CLUB_ID,
      kind: 'public-share',
      payload: {
        tokenHash: hashShareToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scope,
        createdByUserId: 0,
      },
    });

    const response = await GET(
      new Request(`http://localhost/api/public/planning/${token}`) as never,
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const titles = (body.items as Array<{ title: string }>).map((item) => item.title);
    expect(titles).toContain('Entraînement test');
    expect(titles).not.toContain('Match annulé');
  });
});
