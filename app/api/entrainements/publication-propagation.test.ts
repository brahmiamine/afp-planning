import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { savePlanningRecord } from '@/lib/planning/records';
import type { Entrainement } from '@/types/match';
import { POST, PUT } from './route';

const dbAvailable = await isDbAvailable();

function request(body: unknown, token: string) {
  return new NextRequest('http://localhost/api/entrainements', {
    method: 'PUT',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createRequest(body: unknown, token: string) {
  return new NextRequest('http://localhost/api/entrainements', {
    method: 'POST',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Un club synthétique et unique par test : jamais l'APP_CLUB_ID réel (cf. revue Codex sur #169
 * — ce même fichier écrivait auparavant sur published-planning:${APP_CLUB_ID}, ce qui aurait
 * écrasé puis supprimé le planning publié réel d'un développeur lançant `pnpm test` en local). */
async function setupClub(nom: string) {
  const clubId = `test-club-${randomBytes(6).toString('hex')}`;
  const { token: adminToken, user: adminUser, cleanup: cleanupAdmin } = await createTestUserAndSession('admin', { clubId });
  const { user: encadrantUser, cleanup: cleanupEncadrant } = await createTestUserAndSession('encadrant', { clubId, nom });
  return {
    clubId,
    adminToken,
    adminUser,
    encadrantUser,
    cleanup: async () => {
      await cleanupEncadrant();
      await cleanupAdmin();
    },
  };
}

async function publishEntrainement(db: Awaited<ReturnType<typeof getDb>>, clubId: string, created: Entrainement, planningStatus: string) {
  await db.getRepository('Entrainement').update({ id: created.id, clubId }, {
    payload: { ...created, planningStatus } as unknown as Record<string, unknown>,
  });
  const publishedRecordId = `published-planning:${clubId}`;
  await savePlanningRecord(db, {
    id: publishedRecordId,
    clubId,
    kind: 'published-planning',
    payload: {
      schemaVersion: 1,
      publishedAt: new Date().toISOString(),
      publishedByUserId: 0,
      events: [{
        eventId: created.id,
        eventType: 'entrainement',
        title: 'Entraînement test',
        date: created.date,
        time: created.time,
        durationMinutes: created.durationMinutes ?? 90,
        location: created.lieu ?? null,
        planningStatus: 'published',
        event: { ...created, planningStatus: 'published' },
        extras: null,
        assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
      }],
    },
  });
  return publishedRecordId;
}

async function readPublishedEntrainement(db: Awaited<ReturnType<typeof getDb>>, publishedRecordId: string, clubId: string, eventId: string) {
  const rows = (await db.query(
    'SELECT payload FROM planning_records WHERE id = ? AND club_id = ?',
    [publishedRecordId, clubId],
  )) as Array<{ payload: string }>;
  expect(rows).toHaveLength(1);
  const payload = JSON.parse(rows[0]!.payload) as {
    events: Array<{ eventId: string; date: string; time: string; event: { encadrants?: Array<{ nom: string }> } }>;
  };
  return payload.events.find((event) => event.eventId === eventId);
}

async function cleanupClub(db: Awaited<ReturnType<typeof getDb>>, clubId: string, createdId: string | null, publishedRecordId: string) {
  if (createdId) {
    await db.getRepository('Entrainement').delete({ id: createdId, clubId });
    await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
  }
  await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [publishedRecordId, clubId]);
  await db.query('DELETE FROM planning_assignment_state WHERE club_id = ?', [clubId]);
  await db.getRepository('Notification').createQueryBuilder()
    .delete()
    .where('userId IN (SELECT id FROM users WHERE clubId = :clubId)', { clubId })
    .execute();
}

describe.skipIf(!dbAvailable)('PUT /api/entrainements — propagation vers le planning publié (issue #161)', () => {
  it('notifie le nouvel encadrant et met à jour le snapshot publié sans attendre une republication', async () => {
    const encadrantNom = `Encadrant Test ${randomBytes(4).toString('hex')}`;
    const { clubId, adminToken, encadrantUser, cleanup } = await setupClub(encadrantNom);
    let createdId: string | null = null;
    const db = await getDb();
    let publishedRecordId = '';

    try {
      const createResponse = await POST(createRequest(
        { date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [] },
        adminToken,
      ));
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()).entrainement as Entrainement;
      createdId = created.id;
      publishedRecordId = await publishEntrainement(db, clubId, created, 'published');

      const putResponse = await PUT(request({ id: createdId, encadrants: [{ nom: encadrantNom }] }, adminToken));
      expect(putResponse.status).toBe(200);

      // La personne nouvellement affectée est notifiée immédiatement (pas seulement à la
      // prochaine republication globale).
      const notifications = await db.getRepository('Notification').findBy({ userId: encadrantUser.id });
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0]?.type).toBe('assignment-created');

      // Le snapshot publié — celui que lit « Mon planning » — reflète déjà le nouvel encadrant.
      const publishedEvent = await readPublishedEntrainement(db, publishedRecordId, clubId, createdId);
      expect(publishedEvent?.event.encadrants?.map((contact) => contact.nom)).toContain(encadrantNom);
    } finally {
      await cleanupClub(db, clubId, createdId, publishedRecordId);
      await cleanup();
    }
  });

  it('ne republie pas un changement d’horaire sans rapport quand aucune affectation ne change', async () => {
    const { clubId, adminToken, cleanup } = await setupClub(`Encadrant ${randomBytes(4).toString('hex')}`);
    let createdId: string | null = null;
    const db = await getDb();
    let publishedRecordId = '';

    try {
      const createResponse = await POST(createRequest(
        { date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [] },
        adminToken,
      ));
      const created = (await createResponse.json()).entrainement as Entrainement;
      createdId = created.id;
      publishedRecordId = await publishEntrainement(db, clubId, created, 'published');

      // Changement d'horaire seul (aucune affectation touchée) : ne doit pas être propagé au
      // snapshot publié avant une republication globale explicite (issue relevée en revue #177).
      const putResponse = await PUT(request({ id: createdId, time: '11:30' }, adminToken));
      expect(putResponse.status).toBe(200);

      const publishedEvent = await readPublishedEntrainement(db, publishedRecordId, clubId, createdId);
      expect(publishedEvent?.time).toBe('10:00');
    } finally {
      await cleanupClub(db, clubId, createdId, publishedRecordId);
      await cleanup();
    }
  });

  it('réinitialise l’état persisté (accepté/refusé) d’un encadrant réaffecté au même rôle', async () => {
    const encadrantNom = `Encadrant Test ${randomBytes(4).toString('hex')}`;
    const { clubId, adminToken, encadrantUser, cleanup } = await setupClub(encadrantNom);
    let createdId: string | null = null;
    const db = await getDb();
    let publishedRecordId = '';

    try {
      const createResponse = await POST(createRequest(
        { date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [{ nom: encadrantNom }] },
        adminToken,
      ));
      const created = (await createResponse.json()).entrainement as Entrainement;
      createdId = created.id;
      publishedRecordId = await publishEntrainement(db, clubId, created, 'published');

      // Simule une réponse antérieure persistée pour ce rôle/personne (accepté), puis un
      // retrait suivi d'une réaffectation à la même personne. `findAssignablePerson` relie ce
      // nom au compte `encadrantUser` dès la création : la clé d'état est donc id:encadrant:{id},
      // pas nom:{...} (cf. assignmentStatePersonKey).
      await db.query(
        `INSERT INTO planning_assignment_state (club_id, event_type, event_id, role, person_key, person_type, person_id, person_name, state)
         VALUES (?, 'entrainement', ?, 'encadrant', ?, 'encadrant', ?, ?, ?)`,
        [
          clubId, createdId, `id:encadrant:${encadrantUser.id}`, encadrantUser.id, encadrantNom,
          JSON.stringify({ status: 'accepted', remindersSent: [], reminderCount: 0 }),
        ],
      );

      await PUT(request({ id: createdId, encadrants: [] }, adminToken));
      const putResponse = await PUT(request({ id: createdId, encadrants: [{ nom: encadrantNom }] }, adminToken));
      expect(putResponse.status).toBe(200);

      const stateRows = (await db.query(
        `SELECT state FROM planning_assignment_state WHERE club_id = ? AND event_id = ? AND role = 'encadrant'`,
        [clubId, createdId],
      )) as Array<{ state: string }>;
      expect(stateRows).toHaveLength(1);
      expect(JSON.parse(stateRows[0]!.state).status).toBe('pending');
    } finally {
      await cleanupClub(db, clubId, createdId, publishedRecordId);
      await cleanup();
    }
  });
});
