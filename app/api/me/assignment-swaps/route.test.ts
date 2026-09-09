import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { getPlanningEventSnapshot } from '@/lib/planning/event-store';
import { savePublishedPlanning } from '@/lib/planning/published-planning';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { GET, POST } from './route';

const dbAvailable = await isDbAvailable();

vi.mock('@/lib/planning/assignment-suggestions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planning/assignment-suggestions')>();
  return { ...actual, buildAssignmentSuggestions: vi.fn(actual.buildAssignmentSuggestions) };
});

const { buildAssignmentSuggestions } = await import('@/lib/planning/assignment-suggestions');

function getRequest(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `session_token=${token}` } });
}

function postRequest(body: Record<string, unknown>, token: string) {
  return new NextRequest('http://localhost/api/me/assignment-swaps', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('GET/POST /api/me/assignment-swaps (issue #155)', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/me/assignment-swaps'));
    expect(response.status).toBe(401);
  });

  it('rejects an account without a personal (field) role', async () => {
    const admin = await createTestUserAndSession('admin');
    try {
      const response = await GET(getRequest('http://localhost/api/me/assignment-swaps', admin.token));
      expect(response.status).toBe(403);
    } finally {
      await admin.cleanup();
    }
  });

  it('runs the full requester → target → admin-pending lifecycle on a published entrainement', async () => {
    // Club isolé : cette route lit/écrit le planning publié entier du club (closeStaleAssignmentSwaps
    // le parcourt), ce qui collisionnerait avec d'autres tests tournant en parallèle sur le club par
    // défaut (même précaution que app/api/planning/assignment-swaps/route.test.ts).
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const requester = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const target = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    let createdId: string | null = null;
    let swapId: string | null = null;

    try {
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
          encadrants: [{ nom: requester.user.nom, personId: requester.user.id, status: 'accepted' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.entrainement.id as string;

      const liveSnapshot = await runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'entrainement', createdId!));
      if (!liveSnapshot) throw new Error('snapshot introuvable');
      await savePublishedPlanning(db, adminUser, [liveSnapshot]);

      vi.mocked(buildAssignmentSuggestions).mockResolvedValue([{
        personId: target.user.id,
        personType: 'encadrant',
        nom: target.user.nom,
        telephone: null,
        score: 0,
        load30Days: 0,
        upcomingLoad: 0,
        reasons: [],
      }]);

      // Le demandeur crée la proposition d'échange.
      const createSwapResponse = await POST(postRequest({
        action: 'create',
        eventType: 'entrainement',
        eventId: createdId,
        role: 'encadrant',
        targetUserId: target.user.id,
        targetPersonId: target.user.id,
        targetPersonType: 'encadrant',
        message: 'Tu peux me remplacer ?',
      }, requester.token));
      expect(createSwapResponse.status).toBe(200);
      const createBody = await createSwapResponse.json();
      swapId = createBody.swap.id as string;
      expect(createBody.swap.status).toBe('pending-target');

      // Une seconde demande sur la même affectation est refusée tant que la première est ouverte.
      const duplicateResponse = await POST(postRequest({
        action: 'create',
        eventType: 'entrainement',
        eventId: createdId,
        role: 'encadrant',
        targetUserId: target.user.id,
        targetPersonId: target.user.id,
        targetPersonType: 'encadrant',
      }, requester.token));
      expect(duplicateResponse.status).toBe(409);

      // Elle apparaît côté demandeur (mine) et côté cible (incoming).
      const requesterList = await GET(getRequest('http://localhost/api/me/assignment-swaps', requester.token));
      const requesterBody = await requesterList.json();
      expect(requesterBody.mine.some((swap: { id: string }) => swap.id === swapId)).toBe(true);

      const targetList = await GET(getRequest('http://localhost/api/me/assignment-swaps', target.token));
      const targetBody = await targetList.json();
      expect(targetBody.incoming.some((swap: { id: string }) => swap.id === swapId)).toBe(true);

      // La cible accepte : la demande passe en attente de validation admin.
      const respondResponse = await POST(postRequest({ action: 'respond', recordId: swapId, decision: 'accept' }, target.token));
      expect(respondResponse.status).toBe(200);
      const respondBody = await respondResponse.json();
      expect(respondBody.status).toBe('pending-admin');

      // La cible ne peut pas répondre deux fois à la même demande.
      const secondRespondResponse = await POST(postRequest({ action: 'respond', recordId: swapId, decision: 'accept' }, target.token));
      expect(secondRespondResponse.status).toBe(409);
    } finally {
      const db = await getDb();
      if (swapId) await db.query('DELETE FROM planning_records WHERE id = ?', [swapId]);
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [clubId, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await requester.cleanup();
      await target.cleanup();
      await admin.cleanup();
    }
  });

  it('lets the requester cancel a still-open swap request', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const requester = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const target = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    let createdId: string | null = null;
    let swapId: string | null = null;

    try {
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
          encadrants: [{ nom: requester.user.nom, personId: requester.user.id, status: 'accepted' }],
        }),
      }));
      const created = await createResponse.json();
      createdId = created.entrainement.id as string;

      const liveSnapshot = await runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'entrainement', createdId!));
      if (!liveSnapshot) throw new Error('snapshot introuvable');
      await savePublishedPlanning(db, adminUser, [liveSnapshot]);

      vi.mocked(buildAssignmentSuggestions).mockResolvedValue([{
        personId: target.user.id,
        personType: 'encadrant',
        nom: target.user.nom,
        telephone: null,
        score: 0,
        load30Days: 0,
        upcomingLoad: 0,
        reasons: [],
      }]);

      const createSwapResponse = await POST(postRequest({
        action: 'create',
        eventType: 'entrainement',
        eventId: createdId,
        role: 'encadrant',
        targetUserId: target.user.id,
        targetPersonId: target.user.id,
        targetPersonType: 'encadrant',
      }, requester.token));
      const createBody = await createSwapResponse.json();
      swapId = createBody.swap.id as string;

      // La cible ne peut pas annuler une demande qui ne lui appartient pas.
      const forbiddenCancel = await POST(postRequest({ action: 'cancel', recordId: swapId }, target.token));
      expect(forbiddenCancel.status).toBe(403);

      const cancelResponse = await POST(postRequest({ action: 'cancel', recordId: swapId }, requester.token));
      expect(cancelResponse.status).toBe(200);
      const cancelBody = await cancelResponse.json();
      expect(cancelBody.status).toBe('cancelled');
    } finally {
      const db = await getDb();
      if (swapId) await db.query('DELETE FROM planning_records WHERE id = ?', [swapId]);
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [clubId, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await requester.cleanup();
      await target.cleanup();
      await admin.cleanup();
    }
  });
});
