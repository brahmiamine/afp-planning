import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { savePlanningRecord } from '@/lib/planning/records';
import type { Entrainement } from '@/types/match';
import { DELETE, POST } from './route';

const dbAvailable = await isDbAvailable();

function request(method: 'POST' | 'DELETE', token: string, body?: unknown, id?: string) {
  const url = id
    ? `http://localhost/api/entrainements?id=${encodeURIComponent(id)}`
    : 'http://localhost/api/entrainements';
  return new NextRequest(url, {
    method,
    headers: {
      cookie: `session_token=${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe.skipIf(!dbAvailable)('DELETE /api/entrainements — suppression différée (issue #145)', () => {
  it('conserve le snapshot publié et annule immédiatement dans le snapshot quand l’événement était déjà publié (#392)', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const { user, token, cleanup } = await createTestUserAndSession('admin', { clubId });
    const db = await getDb();
    let createdId: string | null = null;
    const publishedRecordId = `published-planning:${clubId}`;

    try {
      const createResponse = await POST(request('POST', token, {
        date: '20/09/2026',
        time: '10:00',
        lieu: 'Terrain test',
        categorie: 'U13',
        encadrants: [],
      }));
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()).entrainement as Entrainement;
      createdId = created.id;

      const publishedEvent: Entrainement = { ...created, planningStatus: 'published' };
      await db.getRepository('Entrainement').update(
        { id: createdId, clubId },
        { payload: publishedEvent as unknown as Record<string, unknown> },
      );
      await savePlanningRecord(db, {
        id: publishedRecordId,
        clubId,
        kind: 'published-planning',
        ownerUserId: user.id,
        payload: {
          schemaVersion: 1,
          publishedAt: new Date().toISOString(),
          publishedByUserId: user.id,
          events: [{
            eventId: createdId,
            eventType: 'entrainement',
            title: 'Entraînement test',
            date: publishedEvent.date,
            time: publishedEvent.time,
            durationMinutes: publishedEvent.durationMinutes ?? 90,
            location: publishedEvent.lieu ?? null,
            planningStatus: 'published',
            event: publishedEvent,
            extras: null,
            assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
          }],
        },
      });

      const deleteResponse = await DELETE(request('DELETE', token, undefined, createdId));
      expect(deleteResponse.status).toBe(200);

      const publishedRows = await db.query(
        'SELECT payload FROM planning_records WHERE id = ? AND club_id = ?',
        [publishedRecordId, clubId],
      ) as Array<{ payload: string }>;
      expect(publishedRows).toHaveLength(1);
      const publishedPayload = JSON.parse(publishedRows[0]!.payload) as {
        events: Array<{ eventId: string; planningStatus: string }>;
      };
      expect(publishedPayload.events.some((event) => event.eventId === createdId)).toBe(true);
      expect(publishedPayload.events.find((event) => event.eventId === createdId)?.planningStatus).toBe('cancelled');

      const liveRow = await db.getRepository('Entrainement').findOneBy({ id: createdId, clubId });
      expect(liveRow).not.toBeNull();
      expect((liveRow?.payload as { planningStatus?: string })?.planningStatus).toBe('cancelled');
    } finally {
      if (createdId) {
        await db.getRepository('Entrainement').delete({ id: createdId, clubId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId, clubId });
        await db.query(
          'DELETE FROM planning_event_state WHERE club_id = ? AND event_type = ? AND event_id = ?',
          [clubId, 'entrainement', createdId],
        );
      }
      await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [publishedRecordId, clubId]);
      await cleanup();
    }
  });
  it('supprime immédiatement un événement qui n’a jamais été publié', async () => {
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const { token, cleanup } = await createTestUserAndSession('admin', { clubId });
    const db = await getDb();
    let createdId: string | null = null;

    try {
      const createResponse = await POST(request('POST', token, {
        date: '21/09/2026',
        time: '18:00',
        lieu: 'Terrain brouillon',
        categorie: 'U15',
        encadrants: [],
      }));
      expect(createResponse.status).toBe(200);
      createdId = ((await createResponse.json()).entrainement as Entrainement).id;

      const deleteResponse = await DELETE(request('DELETE', token, undefined, createdId));
      expect(deleteResponse.status).toBe(200);

      const liveRow = await db.getRepository('Entrainement').findOneBy({ id: createdId, clubId });
      expect(liveRow).toBeNull();
    } finally {
      if (createdId) {
        await db.getRepository('Entrainement').delete({ id: createdId, clubId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId, clubId });
        await db.query(
          'DELETE FROM planning_event_state WHERE club_id = ? AND event_type = ? AND event_id = ?',
          [clubId, 'entrainement', createdId],
        );
      }
      await cleanup();
    }
  });

});
