import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { createTestUserAndSession } from '@/lib/auth/test-helpers';
import { POST as createEntrainement } from '@/app/api/entrainements/route';
import { PUT } from './route';
import { syncOfficialMatchesData } from '@/lib/db/json-migrator';
import type { Match, MatchesData } from '@/types/match';
import { randomBytes } from 'node:crypto';

const dbAvailable = await isDbAvailable();

function putRequest(eventType: string, eventId: string, body: unknown, token: string) {
  return new NextRequest(`http://localhost/api/planning/events/${eventType}/${eventId}`, {
    method: 'PUT',
    headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!dbAvailable)('PUT /api/planning/events/[eventType]/[eventId] (issue #163)', () => {
  it('rejects a stale expectedRevision with 409 instead of silently overwriting a concurrent edit', async () => {
    const { token, cleanup } = await createTestUserAndSession('admin');
    let createdId: string | null = null;
    try {
      const db = await getDb();

      const createResponse = await createEntrainement(new NextRequest('http://localhost/api/entrainements', {
        method: 'POST',
        headers: { cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '20/09/2026', time: '10:00', lieu: 'Terrain test', categorie: 'U13', encadrants: [] }),
      }));
      expect(createResponse.status).toBe(200);
      const created = await createResponse.json();
      createdId = created.entrainement.id as string;

      // Première édition avec la révision de création (0) : doit réussir et faire passer la révision à 1.
      const firstEdit = await PUT(
        putRequest('entrainement', createdId, { lieu: 'Terrain modifié une fois', expectedRevision: 0 }, token),
        { params: { eventType: 'entrainement', eventId: createdId } },
      );
      expect(firstEdit.status).toBe(200);

      // Un deuxième client qui a lu la même révision (0), sans savoir qu'elle a changé entre-temps,
      // doit être rejeté avec 409 plutôt que d'écraser silencieusement la première édition.
      const staleEdit = await PUT(
        putRequest('entrainement', createdId, { lieu: 'Écrasement concurrent', expectedRevision: 0 }, token),
        { params: { eventType: 'entrainement', eventId: createdId } },
      );
      expect(staleEdit.status).toBe(409);

      const row = await db.getRepository('Entrainement').findOneBy({ id: createdId });
      expect((row?.payload as { lieu?: string })?.lieu).toBe('Terrain modifié une fois');
    } finally {
      if (createdId) {
        const db = await getDb();
        await db.getRepository('Entrainement').delete({ id: createdId });
        await db.getRepository('MatchAuditLog').delete({ entityId: createdId });
      }
      await cleanup();
    }
  });

  it('enregistre un override officiel séparé et permet de revenir explicitement à la source', async () => {
    const clubId = `test-override-${randomBytes(5).toString('hex')}`;
    const matchId = `official-${randomBytes(5).toString('hex')}`;
    const { token, user, cleanup } = await createTestUserAndSession('admin', { clubId });
    const source: Match = {
      id: matchId,
      type: 'officiel',
      date: '20/09/2026',
      time: '15:00',
      competition: 'Championnat',
      localTeam: 'Club test',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '14:00',
      details: {
        stadium: 'Stade source',
        dateTime: '20/09/2026 - 15:00',
        competition: 'Championnat',
        address: '1 rue Source',
        terrainType: 'Synthétique',
        itineraryLink: '',
        rawText: '',
      },
      staff: null,
    };
    const data: MatchesData = {
      club: { name: 'Club test', description: '', logo: '' },
      url: 'https://example.test/matches',
      scrapedAt: '2026-09-01T08:00:00.000Z',
      matches: { '20/09/2026': [source] },
    };

    try {
      const db = await getDb();
      await syncOfficialMatchesData(db, data, clubId);

      const edit = await PUT(
        putRequest('officiel', matchId, {
          date: '21/09/2026',
          time: '16:30',
          details: { stadium: 'Stade admin' },
          expectedRevision: 0,
        }, token),
        { params: { eventType: 'officiel', eventId: matchId } },
      );
      expect(edit.status).toBe(200);

      const extrasAfterEdit = await db.getRepository('MatchExtra').findOneByOrFail({ matchId, clubId });
      const editPayload = extrasAfterEdit.payload as Record<string, unknown>;
      expect(editPayload.officialAdminOverride).toMatchObject({
        date: '21/09/2026',
        time: '16:30',
        details: { stadium: 'Stade admin' },
      });
      expect((editPayload.officialSourceSnapshot as Match).date).toBe('20/09/2026');
      expect(editPayload.officialOverrideUpdatedByUserId).toBe(user.id);

      const revert = await PUT(
        putRequest('officiel', matchId, {
          revertToSource: true,
          expectedRevision: 1,
        }, token),
        { params: { eventType: 'officiel', eventId: matchId } },
      );
      expect(revert.status).toBe(200);

      const officialAfterRevert = await db.getRepository('MatchOfficial').findOneByOrFail({ id: matchId, clubId });
      const reverted = officialAfterRevert.payload as unknown as Match;
      expect(reverted.date).toBe('20/09/2026');
      expect(reverted.time).toBe('15:00');
      expect(reverted.details?.stadium).toBe('Stade source');

      const extrasAfterRevert = await db.getRepository('MatchExtra').findOneByOrFail({ matchId, clubId });
      expect((extrasAfterRevert.payload as Record<string, unknown>).officialAdminOverride).toBeNull();

      const audit = await db.getRepository('MatchAuditLog').find({
        where: { entityId: matchId, clubId },
        order: { createdAt: 'ASC' },
      });
      expect(audit).toHaveLength(2);
      expect((audit[0]?.after as Record<string, unknown>)?.sourceOverride).toMatchObject({
        active: true,
        changedFields: expect.arrayContaining(['date', 'time', 'details.stadium']),
      });
      expect((audit[1]?.after as Record<string, unknown>)?.sourceOverride).toMatchObject({
        active: false,
      });
    } finally {
      const db = await getDb();
      await db.getRepository('MatchAuditLog').delete({ entityId: matchId, clubId });
      await db.getRepository('MatchExtra').delete({ matchId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: matchId, clubId });
      await db.getRepository('AppMeta').delete([
        { key: `matches_club_info:${clubId}` },
        { key: `matches_url:${clubId}` },
        { key: `matches_scraped_at:${clubId}` },
      ]);
      await cleanup();
    }
  });
});
