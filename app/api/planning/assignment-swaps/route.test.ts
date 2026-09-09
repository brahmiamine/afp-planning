import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { getSessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import { getPlanningEventSnapshot } from '@/lib/planning/event-store';
import { savePublishedPlanning, getPublishedPlanningEventSnapshot } from '@/lib/planning/published-planning';
import type { PlanningRecordKind } from '@/lib/planning/records';
import { POST as createEntrainement, PUT as updateEntrainement } from '@/app/api/entrainements/route';
import { POST } from './route';

const dbAvailable = await isDbAvailable();
const SWAP_KIND = 'assignment-swap' as PlanningRecordKind;

vi.mock('@/lib/planning/assignment-suggestions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planning/assignment-suggestions')>();
  return { ...actual, buildAssignmentSuggestions: vi.fn(actual.buildAssignmentSuggestions) };
});
vi.mock('@/lib/planning/records', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/planning/records')>();
  return { ...actual, savePlanningRecord: vi.fn(actual.savePlanningRecord) };
});

const { buildAssignmentSuggestions } = await import('@/lib/planning/assignment-suggestions');
const { savePlanningRecord, getPlanningRecord } = await import('@/lib/planning/records');

function approveRequest(recordId: string, decision: 'approve' | 'reject', token: string) {
  return new NextRequest('http://localhost/api/planning/assignment-swaps', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, decision }),
  });
}

describe.skipIf(!dbAvailable)('POST /api/planning/assignment-swaps — atomicité (issue #152)', () => {
  it('publishes only the swapped assignment while structural draft changes remain private (issue #201)', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const requester = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const target = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    let createdId: string | null = null;
    const swapId = `test-swap-${randomBytes(4).toString('hex')}`;

    try {
      const db = await getDb();
      const adminUser = await getSessionUser(admin.token);
      if (!adminUser) throw new Error('admin session introuvable');

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const date = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;
      const publishedTime = '10:00';
      const publishedLocation = 'Terrain publié';

      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time: publishedTime,
          lieu: publishedLocation,
          categorie: 'U13',
          encadrants: [{ nom: requester.user.nom, personId: requester.user.id, status: 'accepted' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.entrainement.id as string;

      const publishedSnapshot = await runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'entrainement', createdId!));
      if (!publishedSnapshot) throw new Error('snapshot introuvable');
      await savePublishedPlanning(db, adminUser, [publishedSnapshot]);

      const draftTime = '11:30';
      const draftLocation = 'Terrain brouillon';
      const updateResponse = await updateEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'PUT',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: createdId,
          date,
          time: draftTime,
          lieu: draftLocation,
          categorie: 'U13',
          encadrants: [{ nom: requester.user.nom, personId: requester.user.id, status: 'accepted' }],
          planningRevision: publishedSnapshot.revision,
        }),
      }));
      expect(updateResponse.status).toBe(200);

      await savePlanningRecord(db, {
        id: swapId,
        clubId,
        kind: SWAP_KIND,
        eventType: 'entrainement',
        eventId: createdId,
        ownerUserId: requester.user.id,
        payload: {
          role: 'encadrant',
          eventType: 'entrainement',
          eventId: createdId,
          eventTitle: publishedSnapshot.title,
          eventDate: publishedSnapshot.date,
          eventTime: publishedSnapshot.time,
          requester: { userId: requester.user.id, personType: 'encadrant', personId: requester.user.id, nom: requester.user.nom },
          target: { userId: target.user.id, personType: 'encadrant', personId: target.user.id, nom: target.user.nom },
          status: 'pending-admin',
          message: null,
          createdAt: new Date().toISOString(),
          targetRespondedAt: new Date().toISOString(),
          adminRespondedAt: null,
          adminUserId: null,
        },
      });

      vi.mocked(buildAssignmentSuggestions).mockResolvedValueOnce([{
        personId: target.user.id,
        personType: 'encadrant',
        nom: target.user.nom,
        telephone: null,
        score: 0,
        load30Days: 0,
        upcomingLoad: 0,
        reasons: [],
      }]);

      const response = await POST(approveRequest(swapId, 'approve', admin.token));
      const responseBody = await response.json();
      expect({ status: response.status, body: responseBody }).toEqual({
        status: 200,
        body: { success: true, status: 'approved' },
      });

      const liveEvent = await runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'entrainement', createdId!));
      expect(liveEvent?.time).toBe(draftTime);
      expect(liveEvent?.location).toBe(draftLocation);
      expect(liveEvent?.assignments.encadrant.some((contact) => contact.personId === target.user.id)).toBe(true);

      const visibleEvent = await runWithClubId(clubId, () => getPublishedPlanningEventSnapshot(db, 'entrainement', createdId!));
      expect(visibleEvent?.time).toBe(publishedTime);
      expect(visibleEvent?.location).toBe(publishedLocation);
      expect(visibleEvent?.assignments.encadrant.some((contact) => contact.personId === requester.user.id)).toBe(false);
      expect(visibleEvent?.assignments.encadrant.some((contact) => contact.personId === target.user.id)).toBe(true);

      const swapRecord = await runWithClubId(clubId, () => getPlanningRecord<{ status: string }>(db, swapId));
      expect(swapRecord?.payload.status).toBe('approved');
    } finally {
      const db = await getDb();
      await db.query('DELETE FROM planning_records WHERE id = ?', [swapId]);
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [admin.user.clubId, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await requester.cleanup();
      await target.cleanup();
      await admin.cleanup();
    }
  });

  it('rolls back the live assignment and published snapshot when persisting the request status fails', async () => {
    // Club isolé : cette route publie/patch le snapshot publié entier du club, ce qui
    // collisionnerait avec d'autres tests d'intégration tournant en parallèle sur le
    // club par défaut (voir les tests similaires dans ce dépôt, ex. deferred-delete.test.ts).
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const requester = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    const target = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    let createdId: string | null = null;
    const swapId = `test-swap-${randomBytes(4).toString('hex')}`;

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

      // Le contexte club ambiant n'est fiable que pendant l'exécution d'une requête ; on le
      // fixe explicitement ici plutôt que de compter sur ce que le dernier appel de route a
      // laissé derrière lui.
      const liveSnapshot = await runWithClubId(clubId, () => getPlanningEventSnapshot(db, 'entrainement', createdId!));
      if (!liveSnapshot) throw new Error('snapshot introuvable');
      await savePublishedPlanning(db, adminUser, [liveSnapshot]);

      await savePlanningRecord(db, {
        id: swapId,
        clubId,
        kind: SWAP_KIND,
        eventType: 'entrainement',
        eventId: createdId,
        ownerUserId: requester.user.id,
        payload: {
          role: 'encadrant',
          eventType: 'entrainement',
          eventId: createdId,
          eventTitle: liveSnapshot.title,
          eventDate: liveSnapshot.date,
          eventTime: liveSnapshot.time,
          requester: { userId: requester.user.id, personType: 'encadrant', personId: requester.user.id, nom: requester.user.nom },
          target: { userId: target.user.id, personType: 'encadrant', personId: target.user.id, nom: target.user.nom },
          status: 'pending-admin',
          message: null,
          createdAt: new Date().toISOString(),
          targetRespondedAt: new Date().toISOString(),
          adminRespondedAt: null,
          adminUserId: null,
        },
      });

      vi.mocked(buildAssignmentSuggestions).mockResolvedValueOnce([{
        personId: target.user.id,
        personType: 'encadrant',
        nom: target.user.nom,
        telephone: null,
        score: 0,
        load30Days: 0,
        upcomingLoad: 0,
        reasons: [],
      }]);
      vi.mocked(savePlanningRecord).mockRejectedValueOnce(new Error('injected failure'));

      const response = await POST(approveRequest(swapId, 'approve', admin.token));
      expect(response.status).toBe(500);

      // La panne survient lors de la dernière écriture (statut de la demande) : l'affectation
      // live et le snapshot publié, écrits juste avant dans la même transaction, doivent aussi
      // être annulés plutôt que d'appliquer l'échange en laissant la demande `pending-admin`
      // (issue #152).
      const liveRow = await db.getRepository('Entrainement').findOneBy({ id: createdId });
      const liveEncadrants = (liveRow?.payload as { encadrants?: Array<{ personId?: number }> })?.encadrants ?? [];
      expect(liveEncadrants.some((contact) => contact.personId === requester.user.id)).toBe(true);
      expect(liveEncadrants.some((contact) => contact.personId === target.user.id)).toBe(false);

      const publishedEvent = await runWithClubId(clubId, () => getPublishedPlanningEventSnapshot(db, 'entrainement', createdId!));
      const publishedEncadrants = publishedEvent?.assignments.encadrant ?? [];
      expect(publishedEncadrants.some((contact) => contact.personId === requester.user.id)).toBe(true);
      expect(publishedEncadrants.some((contact) => contact.personId === target.user.id)).toBe(false);

      const swapRecord = await runWithClubId(clubId, () => getPlanningRecord<{ status: string }>(db, swapId));
      expect(swapRecord?.payload.status).toBe('pending-admin');
    } finally {
      const db = await getDb();
      await db.query('DELETE FROM planning_records WHERE id = ?', [swapId]);
      if (createdId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind = ?', [admin.user.clubId, 'published-planning']);
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await requester.cleanup();
      await target.cleanup();
      await admin.cleanup();
    }
  });
});
