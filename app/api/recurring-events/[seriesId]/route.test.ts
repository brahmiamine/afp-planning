import { describe, expect, it } from 'vitest';
import { In } from 'typeorm';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST as createSeries } from '../route';
import { DELETE, PUT } from './route';
import { POST as publishPlanning } from '@/app/api/planning/publication-all/route';
import { getPublishedPlanning } from '@/lib/planning/published-planning';
import { runWithClubId } from '@/lib/auth/club-context';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('/api/recurring-events/[seriesId] (issue #128 payload codecs)', () => {
  it('modifie puis supprime une série entière via les codecs versionnés', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let seriesId: string | null = null;
    try {
      const createRequest = new NextRequest('http://localhost/api/recurring-events', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'entrainement',
          startDate: '2026-09-21',
          endDate: '2026-09-28',
          frequencyWeeks: 1,
          time: '18:00',
          lieu: 'Terrain série',
          categorie: 'U15',
        }),
      });
      const createResponse = await createSeries(createRequest);
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      seriesId = created.seriesId;
      expect(created.count).toBe(2);

      const db = await getDb();
      const rowsBeforeUpdate = await db.getRepository('Entrainement').findBy({});
      const seriesRows = rowsBeforeUpdate.filter((row) => (row.payload as Record<string, unknown>).seriesId === seriesId);
      expect(seriesRows).toHaveLength(2);
      for (const row of seriesRows) {
        expect((row.payload as Record<string, unknown>).schemaVersion).toBe(1);
      }

      const putRequest = new NextRequest(`http://localhost/api/recurring-events/${seriesId}`, {
        method: 'PUT',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lieu: 'Terrain série modifié' }),
      });
      const putResponse = await PUT(putRequest, { params: { seriesId: seriesId! } });
      expect(putResponse.status).toBe(200);
      const updated = await putResponse.json();
      expect(updated.updated).toBe(2);

      const rowsAfterUpdate = await db.getRepository('Entrainement').findBy({});
      const updatedSeriesRows = rowsAfterUpdate.filter((row) => (row.payload as Record<string, unknown>).seriesId === seriesId);
      for (const row of updatedSeriesRows) {
        const payload = row.payload as Record<string, unknown>;
        expect(payload.lieu).toBe('Terrain série modifié');
        expect(payload.schemaVersion).toBe(1);
        expect(payload.planningRevision).toBe(1);
      }

      const deleteRequest = new NextRequest(`http://localhost/api/recurring-events/${seriesId}`, {
        method: 'DELETE',
        headers: { cookie: `session_token=${token}` },
      });
      const deleteResponse = await DELETE(deleteRequest, { params: { seriesId: seriesId! } });
      expect(deleteResponse.status).toBe(200);
      const deleted = await deleteResponse.json();
      expect(deleted.removed).toBe(2);
      seriesId = null;
    } finally {
      if (seriesId) {
        const db = await getDb();
        const rows = await db.getRepository('Entrainement').findBy({});
        const ids = rows.filter((row) => (row.payload as Record<string, unknown>).seriesId === seriesId).map((row) => row.id);
        if (ids.length) {
          await db.getRepository('Entrainement').delete(ids);
          await db.getRepository('MatchAuditLog').delete({ entityId: In(ids) });
        }
      }
      await cleanup();
    }
  });

  it('garde les modifications et annulations publiées invisibles jusqu’à la publication globale (issue #200)', async () => {
    const clubId = `test-club-${crypto.randomUUID()}`;
    const { token, user, cleanup } = await createTestUserAndSession('admin', { clubId });
    let seriesId: string | null = null;
    try {
      const createResponse = await createSeries(new NextRequest('http://localhost/api/recurring-events', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'entrainement',
          startDate: '2026-10-05',
          endDate: '2026-10-12',
          frequencyWeeks: 1,
          time: '18:00',
          lieu: 'Terrain publié',
          categorie: 'U15',
        }),
      }));
      const created = await createResponse.json();
      seriesId = created.seriesId;

      const publishRequest = () => new NextRequest('http://localhost/api/planning/publication-all', {
        method: 'POST',
        headers: { cookie: `session_token=${token}` },
      });
      expect((await publishPlanning(publishRequest())).status).toBe(200);

      const before = await runWithClubId(clubId, () => getPublishedPlanning(getDb() as never, clubId));
      const publishedSeries = before?.events.filter((event) =>
        (event.event as { seriesId?: string }).seriesId === seriesId,
      ) ?? [];
      expect(publishedSeries).toHaveLength(2);
      expect(publishedSeries.every((event) => event.location === 'Terrain publié')).toBe(true);

      const updateResponse = await PUT(new NextRequest(`http://localhost/api/recurring-events/${seriesId}`, {
        method: 'PUT',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lieu: 'Terrain préparé' }),
      }), { params: { seriesId: seriesId! } });
      expect(updateResponse.status).toBe(200);

      const stillPublished = await runWithClubId(clubId, () => getPublishedPlanning(getDb() as never, clubId));
      expect(stillPublished?.events.filter((event) =>
        (event.event as { seriesId?: string }).seriesId === seriesId,
      ).every((event) => event.location === 'Terrain publié')).toBe(true);

      const deleteResponse = await DELETE(new NextRequest(`http://localhost/api/recurring-events/${seriesId}`, {
        method: 'DELETE',
        headers: { cookie: `session_token=${token}` },
      }), { params: { seriesId: seriesId! } });
      expect(deleteResponse.status).toBe(200);
      expect((await deleteResponse.json()).pendingCancellations).toBe(2);

      const db = await getDb();
      const liveRows = (await db.getRepository('Entrainement').findBy({ clubId }))
        .filter((row) => (row.payload as { seriesId?: string }).seriesId === seriesId);
      expect(liveRows).toHaveLength(2);
      expect(liveRows.every((row) => (row.payload as { planningStatus?: string }).planningStatus === 'cancelled')).toBe(true);

      const beforeCancellationPublish = await runWithClubId(clubId, () => getPublishedPlanning(db, clubId));
      expect(beforeCancellationPublish?.events.filter((event) =>
        (event.event as { seriesId?: string }).seriesId === seriesId,
      ).every((event) => event.planningStatus === 'published')).toBe(true);

      expect((await publishPlanning(publishRequest())).status).toBe(200);
      const after = await runWithClubId(clubId, () => getPublishedPlanning(db, clubId));
      expect(after?.events.filter((event) =>
        (event.event as { seriesId?: string }).seriesId === seriesId,
      ).every((event) => event.planningStatus === 'cancelled')).toBe(true);
      seriesId = null;
    } finally {
      const db = await getDb();
      const rows = await db.getRepository('Entrainement').findBy({ clubId });
      const ids = rows.filter((row) => (row.payload as { seriesId?: string }).seriesId === seriesId).map((row) => row.id);
      if (ids.length) await db.getRepository('Entrainement').delete(ids);
      await db.query('DELETE FROM planning_records WHERE club_id = ?', [clubId]);
      await db.getRepository('MatchAuditLog').delete({ clubId });
      await cleanup();
    }
  });
});
