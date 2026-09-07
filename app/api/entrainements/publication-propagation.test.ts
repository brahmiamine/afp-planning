import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { deletePlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import type { Entrainement } from '@/types/match';
import { POST, PUT } from './route';

const dbAvailable = await isDbAvailable();
const CLUB_ID = process.env.APP_CLUB_ID || 'afp';

function request(method: string, body: unknown, token: string) {
  return new NextRequest('http://localhost/api/entrainements', {
    method,
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('PUT /api/entrainements — propagation vers le planning publié (issue #161)', () => {
  it('notifie le nouvel encadrant et met à jour le snapshot publié sans attendre une republication', async () => {
    const { token: adminToken, cleanup: cleanupAdmin } = await createTestUserAndSession('admin');
    const encadrantNom = `Encadrant Test ${randomBytes(4).toString('hex')}`;
    const { user: encadrantUser, cleanup: cleanupEncadrant } = await createTestUserAndSession('encadrant', { nom: encadrantNom });

    let createdId: string | null = null;
    const db = await getDb();
    const publishedRecordId = `published-planning:${CLUB_ID}`;

    try {
      const createResponse = await POST(request('POST', {
        date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [],
      }, adminToken));
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()).entrainement as Entrainement;
      createdId = created.id;

      // Simule un entraînement déjà publié (la création par POST le laisse en 'draft').
      await db.getRepository('Entrainement').update({ id: createdId, clubId: CLUB_ID }, {
        payload: { ...created, planningStatus: 'published' } as unknown as Record<string, unknown>,
      });
      await savePlanningRecord(db, {
        id: publishedRecordId,
        clubId: CLUB_ID,
        kind: 'published-planning',
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: 0,
          events: [{
            eventId: createdId,
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

      const putResponse = await PUT(request('PUT', { id: createdId, encadrants: [{ nom: encadrantNom }] }, adminToken));
      expect(putResponse.status).toBe(200);

      // La personne nouvellement affectée est notifiée immédiatement (pas seulement à la
      // prochaine republication globale).
      const notifications = await db.getRepository('Notification').findBy({ userId: encadrantUser.id });
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0]?.type).toBe('assignment-created');

      // Le snapshot publié — celui que lit « Mon planning » — reflète déjà le nouvel encadrant.
      const rows = (await db.query(
        'SELECT payload FROM planning_records WHERE id = ? AND club_id = ?',
        [publishedRecordId, CLUB_ID],
      )) as Array<{ payload: string }>;
      expect(rows).toHaveLength(1);
      const publishedPayload = JSON.parse(rows[0]!.payload) as {
        events: Array<{ eventId: string; event: { encadrants?: Array<{ nom: string }> } }>;
      };
      const publishedEvent = publishedPayload.events.find((event) => event.eventId === createdId);
      expect(publishedEvent?.event.encadrants?.map((contact) => contact.nom)).toContain(encadrantNom);
    } finally {
      if (createdId) {
        await db.getRepository('Entrainement').delete({ id: createdId, clubId: CLUB_ID });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await db.getRepository('Notification').delete({ userId: encadrantUser.id });
      await deletePlanningRecord(db, publishedRecordId);
      await cleanupEncadrant();
      await cleanupAdmin();
    }
  });
});
