import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import type { Match, MatchesData } from '@/types/match';
import { syncOfficialMatchesData } from './json-migrator';

const dbAvailable = await isDbAvailable();

function scraperData(match: Match, scrapedAt: string): MatchesData {
  return {
    club: { name: 'Club test', description: '', logo: '' },
    url: 'https://example.test/matches',
    scrapedAt,
    matches: { '20/09/2026': [match] },
  };
}

describe.skipIf(!dbAvailable)('official match admin overrides (issue #151)', () => {
  it('préserve une correction manuelle de date lors des scrapes suivants tout en rafraîchissant les autres champs source', async () => {
    const db = await getDb();
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const matchId = `official-${randomBytes(6).toString('hex')}`;

    const sourceMatch: Match = {
      id: matchId,
      type: 'officiel',
      date: '20/09/2026',
      time: '15:00',
      competition: 'Championnat J1',
      localTeam: 'Club test',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '14:00',
      details: {
        stadium: 'Stade source',
        dateTime: '20/09/2026 - 15:00',
        competition: 'Championnat J1',
        address: '1 rue Source',
        terrainType: 'Synthétique',
        itineraryLink: '',
        rawText: '',
      },
      staff: null,
    };

    try {
      await syncOfficialMatchesData(
        db,
        scraperData(sourceMatch, '2026-09-01T08:00:00.000Z'),
        clubId,
      );

      const repo = db.getRepository('MatchOfficial');
      const row = await repo.findOneByOrFail({ id: matchId, clubId });
      const initialExtras = await db.getRepository('MatchExtra').findOneByOrFail({ matchId, clubId });
      expect((row.payload as Record<string, unknown>).schemaVersion).toBe(1);
      expect((initialExtras.payload as Record<string, unknown>).schemaVersion).toBe(1);
      const manuallyCorrected: Match = {
        ...(row.payload as unknown as Match),
        date: '21/09/2026',
        time: '16:30',
        details: {
          ...((row.payload as unknown as Match).details ?? sourceMatch.details!),
          dateTime: '21/09/2026 - 16:30',
          stadium: 'Stade corrigé par admin',
        },
      };
      row.date = manuallyCorrected.date;
      row.time = manuallyCorrected.time;
      row.payload = manuallyCorrected as unknown as Record<string, unknown>;
      await repo.save(row);

      await syncOfficialMatchesData(
        db,
        scraperData({
          ...sourceMatch,
          competition: 'Championnat J1 - mise à jour source',
        }, '2026-09-02T08:00:00.000Z'),
        clubId,
      );

      const afterScrape = await repo.findOneByOrFail({ id: matchId, clubId });
      const effective = afterScrape.payload as unknown as Match;

      expect(effective.date).toBe('21/09/2026');
      expect(effective.time).toBe('16:30');
      expect(effective.details?.stadium).toBe('Stade corrigé par admin');
      expect(effective.competition).toBe('Championnat J1 - mise à jour source');
    } finally {
      await db.getRepository('MatchExtra').delete({ matchId, clubId });
      await db.getRepository('MatchOfficial').delete({ id: matchId, clubId });
      await db.getRepository('AppMeta').delete([
        { key: `matches_club_info:${clubId}` },
        { key: `matches_url:${clubId}` },
        { key: `matches_scraped_at:${clubId}` },
      ]);
    }
  });
});
