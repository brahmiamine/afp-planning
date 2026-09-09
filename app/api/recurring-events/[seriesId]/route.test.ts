import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { In } from 'typeorm';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { runWithClubId } from '@/lib/auth/club-context';
import { getPublishedPlanningEventSnapshot } from '@/lib/planning/published-planning';
import { POST as createSeries } from '../route';
import { POST as publishAll } from '@/app/api/planning/publication-all/route';
import { DELETE, PUT } from './route';

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
          await db.getRepository('Entrainement').delete({ id: In(ids), clubId: process.env.APP_CLUB_ID || 'afp' });
          await db.getRepository('MatchAuditLog').delete({ entityId: In(ids) });
        }
      }
      await cleanup();
    }
  });
});

describe.skipIf(!dbAvailable)('/api/recurring-events/[seriesId] — cycle de publication (issue #200)', () => {
  it('prépare la modification et la suppression d\'une série déjà publiée sans les rendre visibles immédiatement', async () => {
    // Club isolé : la publication globale considère tous les événements live du club.
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const admin = await createTestUserAndSession('admin', { clubId });
    const encadrant = await createTestUserAndSession('dirigeant', { clubId }, ['encadrant']);
    let seriesId: string | null = null;

    try {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const startDate = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
      const laterDate = new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const endDate = `${laterDate.getFullYear()}-${String(laterDate.getMonth() + 1).padStart(2, '0')}-${String(laterDate.getDate()).padStart(2, '0')}`;

      const createResponse = await createSeries(new NextRequest('http://localhost/api/recurring-events', {
        method: 'POST',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'entrainement',
          startDate,
          endDate,
          frequencyWeeks: 1,
          time: '18:00',
          lieu: 'Terrain série',
          categorie: 'U15',
          encadrants: [{ nom: encadrant.user.nom, personId: encadrant.user.id, status: 'accepted' }],
        }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      seriesId = created.seriesId;

      const publishResponse = await publishAll(new NextRequest('http://localhost/api/planning/publication-all', {
        headers: { cookie: `session_token=${admin.token}` },
      }));
      expect(publishResponse.status).toBe(200);

      const db = await getDb();
      const seriesRowIds = (await db.getRepository('Entrainement').findBy({}))
        .filter((row) => (row.payload as Record<string, unknown>).seriesId === seriesId)
        .map((row) => row.id as string);
      expect(seriesRowIds.length).toBeGreaterThanOrEqual(1);
      const firstEventId = seriesRowIds[0]!;

      const publishedBeforeUpdate = await runWithClubId(clubId, () => getPublishedPlanningEventSnapshot(db, 'entrainement', firstEventId));
      expect(publishedBeforeUpdate?.location).toBe('Terrain série');

      // Modifier une série déjà publiée reste en préparation : le planning publié (ce que
      // /mon-planning affiche) ne doit pas bouger avant la prochaine publication globale.
      const putResponse = await PUT(new NextRequest(`http://localhost/api/recurring-events/${seriesId}`, {
        method: 'PUT',
        headers: { cookie: `session_token=${admin.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lieu: 'Terrain série modifié' }),
      }), { params: { seriesId: seriesId! } });
      expect(putResponse.status).toBe(200);

      const publishedAfterUpdate = await runWithClubId(clubId, () => getPublishedPlanningEventSnapshot(db, 'entrainement', firstEventId));
      expect(publishedAfterUpdate?.location).toBe('Terrain série');
      const liveAfterUpdate = await db.getRepository('Entrainement').findOneBy({ id: firstEventId });
      expect((liveAfterUpdate?.payload as Record<string, unknown>).planningStatus).toBe('modified');

      // Supprimer une série déjà publiée prépare une annulation (comme un événement isolé) :
      // aucun événement n'est retiré du planning publié tant que l'admin n'a pas republié.
      const deleteResponse = await DELETE(new NextRequest(`http://localhost/api/recurring-events/${seriesId}`, {
        method: 'DELETE',
        headers: { cookie: `session_token=${admin.token}` },
      }), { params: { seriesId: seriesId! } });
      expect(deleteResponse.status).toBe(200);
      const deleted = await deleteResponse.json();
      expect(deleted.removed).toBe(0);
      expect(deleted.deferred).toBeGreaterThanOrEqual(1);

      const publishedAfterDelete = await runWithClubId(clubId, () => getPublishedPlanningEventSnapshot(db, 'entrainement', firstEventId));
      expect(publishedAfterDelete).not.toBeNull();
      const liveAfterDelete = await db.getRepository('Entrainement').findOneBy({ id: firstEventId });
      expect(liveAfterDelete).not.toBeNull();
      expect((liveAfterDelete?.payload as Record<string, unknown>).planningStatus).toBe('cancelled');
    } finally {
      const db = await getDb();
      if (seriesId) {
        await db.query('DELETE FROM planning_records WHERE club_id = ? AND kind LIKE ?', [clubId, 'published-planning%']);
        const rows = await db.getRepository('Entrainement').findBy({});
        const ids = rows.filter((row) => (row.payload as Record<string, unknown>).seriesId === seriesId).map((row) => row.id);
        if (ids.length) {
          await db.getRepository('Entrainement').delete({ id: In(ids), clubId });
          await db.getRepository('MatchAuditLog').delete({ entityId: In(ids) });
        }
      }
      await encadrant.cleanup();
      await admin.cleanup();
    }
  });
});
