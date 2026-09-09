import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getPublishedPlanningEventSnapshot } from '@/lib/planning/published-planning';
import { runWithClubId } from '@/lib/auth/club-context';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { GET, POST } from './route';

const dbAvailable = await isDbAvailable();

function authedRequest(token: string) {
  return new NextRequest('http://localhost/api/planning/publication-all', {
    headers: { cookie: `session_token=${token}` },
  });
}

describe.skipIf(!dbAvailable)('GET/POST /api/planning/publication-all (issue #155)', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/planning/publication-all'));
    expect(response.status).toBe(401);
  });

  it('previews then publishes a ready entrainement end to end', async () => {
    // Club isolé : la publication globale considère TOUS les événements live du club, ce qui
    // collisionnerait avec d'autres tests d'intégration tournant en parallèle sur le club
    // par défaut.
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    let createdId: string | null = null;

    try {
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
          encadrants: [{ nom: encadrant.user.nom, personId: encadrant.user.id, status: 'accepted' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      createdId = (await createResponse.json()).entrainement.id as string;

      const previewResponse = await GET(authedRequest(admin.token));
      expect(previewResponse.status).toBe(200);
      const preview = await previewResponse.json();
      expect(preview.diff.added).toBeGreaterThanOrEqual(1);
      expect(preview.blockers.some((blocker: { eventId: string }) => blocker.eventId === createdId)).toBe(false);

      const publishResponse = await POST(authedRequest(admin.token));
      expect(publishResponse.status).toBe(200);
      const publishBody = await publishResponse.json();
      expect(publishBody.success).toBe(true);

      const db = await getDb();
      const published = await runWithClubId(clubId, () => getPublishedPlanningEventSnapshot(db, 'entrainement', createdId!));
      expect(published?.planningStatus).toBe('published');
    } finally {
      const db = await getDb();
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind LIKE ?', [admin.user.clubId, 'published-planning%']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await encadrant.cleanup();
      await admin.cleanup();
    }
  });
});
