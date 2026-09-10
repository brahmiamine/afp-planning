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
      // Colonne indexée dédiée (issue #277) : la résolution par jeton lit désormais
      // `token_hash`, jamais le `payload` en balayant les enregistrements récents.
      tokenHash: hashShareToken(token),
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

  it('refuse un lien de partage par ailleurs valide une fois le club désactivé (issue #213)', async () => {
    const db = await getDb();

    const token = newShareToken();
    const shareId = `public-share:${randomBytes(8).toString('hex')}`;
    cleanupIds.push(shareId);
    const scope: PublicShareScope = { eventTypes: [], fromDate: null, toDate: null };
    await savePlanningRecord(db, {
      id: shareId,
      clubId: CLUB_ID,
      kind: 'public-share',
      tokenHash: hashShareToken(token),
      payload: {
        tokenHash: hashShareToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scope,
        createdByUserId: 0,
      },
    });

    await db.getRepository('ClubTenant').save({ id: CLUB_ID, name: 'Club test désactivé', active: false });

    try {
      const response = await GET(
        new Request(`http://localhost/api/public/planning/${token}`) as never,
        { params: Promise.resolve({ token }) },
      );
      expect(response.status).toBe(404);

      const invalidResponse = await GET(
        new Request('http://localhost/api/public/planning/token-manifestement-invalide-000000') as never,
        { params: Promise.resolve({ token: 'token-manifestement-invalide-000000' }) },
      );
      const body = await response.json();
      const invalidBody = await invalidResponse.json();
      expect(body.error).toBe(invalidBody.error);
    } finally {
      await db.getRepository('ClubTenant').delete({ id: CLUB_ID });
    }
  });

  it('résout un lien via une recherche indexée directe, quel que soit le nombre d\'autres liens émis depuis (issue #277)', async () => {
    const db = await getDb();

    const token = newShareToken();
    const shareId = `public-share:${randomBytes(8).toString('hex')}`;
    cleanupIds.push(shareId);
    const scope: PublicShareScope = { eventTypes: [], fromDate: null, toDate: null };
    await savePlanningRecord(db, {
      id: shareId,
      clubId: CLUB_ID,
      kind: 'public-share',
      tokenHash: hashShareToken(token),
      payload: {
        tokenHash: hashShareToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scope,
        createdByUserId: 0,
      },
    });

    // Plusieurs liens plus récents, dans un autre club : avant l'issue #277, un
    // balayage limité aux 1000 enregistrements les plus récents (tous clubs confondus)
    // pouvait rendre ce lien plus ancien irrésolvable une fois assez de liens émis
    // depuis. La recherche indexée par `token_hash` ne dépend plus de l'ancienneté.
    const otherClubId = `test-club-${randomBytes(6).toString('hex')}`;
    for (let i = 0; i < 3; i += 1) {
      const decoyId = `public-share:${randomBytes(8).toString('hex')}`;
      cleanupIds.push(decoyId);
      await savePlanningRecord(db, {
        id: decoyId,
        clubId: otherClubId,
        kind: 'public-share',
        tokenHash: hashShareToken(newShareToken()),
        payload: {
          tokenHash: hashShareToken(newShareToken()),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          scope,
          createdByUserId: 0,
        },
      });
    }

    try {
      const response = await GET(
        new Request(`http://localhost/api/public/planning/${token}`) as never,
        { params: Promise.resolve({ token }) },
      );
      expect(response.status).toBe(200);
    } finally {
      await db.query('DELETE FROM planning_records WHERE club_id = ?', [otherClubId]);
    }
  });

  it('un jeton isole strictement les événements de son propre club (issue #277)', async () => {
    const db = await getDb();
    const otherClubId = `test-club-${randomBytes(6).toString('hex')}`;
    const scope: PublicShareScope = { eventTypes: [], fromDate: null, toDate: null };

    const publishedIdA = `published-planning:${CLUB_ID}`;
    cleanupIds.push(publishedIdA);
    await savePlanningRecord(db, {
      id: publishedIdA,
      clubId: CLUB_ID,
      kind: 'published-planning',
      payload: {
        schemaVersion: 1,
        publishedAt: new Date().toISOString(),
        publishedByUserId: 0,
        events: [snapshot({ eventId: 'evt-club-a', title: 'Événement club A' })],
      },
    });

    const tokenA = newShareToken();
    const shareIdA = `public-share:${randomBytes(8).toString('hex')}`;
    cleanupIds.push(shareIdA);
    await savePlanningRecord(db, {
      id: shareIdA,
      clubId: CLUB_ID,
      kind: 'public-share',
      tokenHash: hashShareToken(tokenA),
      payload: {
        tokenHash: hashShareToken(tokenA),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scope,
        createdByUserId: 0,
      },
    });

    const publishedIdB = `published-planning:${otherClubId}`;
    await savePlanningRecord(db, {
      id: publishedIdB,
      clubId: otherClubId,
      kind: 'published-planning',
      payload: {
        schemaVersion: 1,
        publishedAt: new Date().toISOString(),
        publishedByUserId: 0,
        events: [snapshot({ eventId: 'evt-club-b', title: 'Événement club B' })],
      },
    });

    const tokenB = newShareToken();
    const shareIdB = `public-share:${randomBytes(8).toString('hex')}`;
    await savePlanningRecord(db, {
      id: shareIdB,
      clubId: otherClubId,
      kind: 'public-share',
      tokenHash: hashShareToken(tokenB),
      payload: {
        tokenHash: hashShareToken(tokenB),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scope,
        createdByUserId: 0,
      },
    });

    try {
      const responseA = await GET(
        new Request(`http://localhost/api/public/planning/${tokenA}`) as never,
        { params: Promise.resolve({ token: tokenA }) },
      );
      const responseB = await GET(
        new Request(`http://localhost/api/public/planning/${tokenB}`) as never,
        { params: Promise.resolve({ token: tokenB }) },
      );
      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      const titlesA = ((await responseA.json()).items as Array<{ title: string }>).map((item) => item.title);
      const titlesB = ((await responseB.json()).items as Array<{ title: string }>).map((item) => item.title);
      // Le jeton de A ne doit jamais résoudre les événements de B, ni inversement :
      // chacun reste scopé au club qui l'a émis, malgré une recherche désormais globale
      // (sans filtre club_id préalable) sur `token_hash`.
      expect(titlesA).toContain('Événement club A');
      expect(titlesA).not.toContain('Événement club B');
      expect(titlesB).toContain('Événement club B');
      expect(titlesB).not.toContain('Événement club A');
    } finally {
      await db.query('DELETE FROM planning_records WHERE club_id = ?', [otherClubId]);
    }
  });
});
