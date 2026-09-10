import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { getPlanningEventSnapshot } from '@/lib/planning/event-store';
import { savePublishedPlanning } from '@/lib/planning/published-planning';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { GET } from './route';

const dbAvailable = await isDbAvailable();

function planningRequest(token?: string) {
  return new NextRequest('http://localhost/api/me/planning', {
    headers: token ? { cookie: `session_token=${token}` } : undefined,
  });
}

describe.skipIf(!dbAvailable)('GET /api/me/planning (issue #286)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('rejects an anonymous request', async () => {
    const response = await GET(planningRequest());
    expect(response.status).toBe(401);
  });

  it('rejects a user without a planning function', async () => {
    const admin = await createTestUserAndSession('admin');
    cleanups.push(admin.cleanup);
    const response = await GET(planningRequest(admin.token));
    expect(response.status).toBe(403);
  });

  it('returns published assignments for the caller club only', async () => {
    const clubA = `test-club-${randomBytes(6).toString('hex')}`;
    const clubB = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId: clubA });
    const encadrantA = await createTestUserAndSession('dirigeant', { clubId: clubA }, ['encadrant']);
    const encadrantB = await createTestUserAndSession('dirigeant', { clubId: clubB }, ['encadrant']);
    let createdId: string | null = null;
    cleanups.push(async () => {
      const db = await getDb();
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [clubA, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await db.getRepository('ClubTenant').delete({ id: clubA });
      await db.getRepository('ClubTenant').delete({ id: clubB });
    }, encadrantB.cleanup, encadrantA.cleanup, admin.cleanup);

    const db = await getDb();
    const adminUser = await getSessionUser(admin.token);
    if (!adminUser) throw new Error('admin session introuvable');

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const date = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;

    const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
      method: 'POST',
      headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        time: '10:00',
        lieu: 'Terrain test',
        categorie: 'U13',
        encadrants: [{ nom: encadrantA.user.nom, personId: encadrantA.user.id, status: 'pending' }],
      }),
    }));
    expect(createResponse.status).toBe(200);
    createdId = (await createResponse.json()).entrainement.id as string;

    await runWithClubId(clubA, async () => {
      const liveSnapshot = await getPlanningEventSnapshot(db, 'entrainement', createdId!);
      if (!liveSnapshot) throw new Error('snapshot introuvable');
      await savePublishedPlanning(db, adminUser, [liveSnapshot]);
    });

    const mine = await GET(planningRequest(encadrantA.token));
    expect(mine.status).toBe(200);
    const mineBody = await mine.json() as {
      assignments: Array<{ eventId: string; eventType: string }>;
      events: Array<{ eventId: string }>;
      stats: { totalEvents: number; totalAssignments: number };
    };
    expect(mineBody.assignments.some((item) => item.eventId === createdId)).toBe(true);
    expect(mineBody.events.some((item) => item.eventId === createdId)).toBe(true);
    expect(mineBody.stats.totalEvents).toBeGreaterThanOrEqual(1);

    const otherClub = await GET(planningRequest(encadrantB.token));
    expect(otherClub.status).toBe(200);
    const otherBody = await otherClub.json() as { assignments: Array<{ eventId: string }>; events: Array<{ eventId: string }> };
    expect(otherBody.assignments.some((item) => item.eventId === createdId)).toBe(false);
    expect(otherBody.events.some((item) => item.eventId === createdId)).toBe(false);
  });
});
