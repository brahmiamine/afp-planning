import { afterEach, describe, expect, it } from 'vitest';
import type { Match, MatchesData } from '@/types/match';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import {
  isSuspiciousOfficialSnapshot,
  nextSourceMissingObservation,
  syncOfficialMatchesData,
} from './json-migrator';

function match(overrides: Partial<Match> = {}): Match {
  return {
    date: '20/08/2026',
    competition: 'Championnat U15 - Journée 3',
    categorie: 'U15',
    localTeam: 'AFP 18 U15',
    awayTeam: 'Paris Nord FC U15',
    venue: 'domicile',
    time: '18:00',
    horaireRendezVous: '17:00',
    ...overrides,
  };
}

describe('official match scraper safety rules', () => {
  it('rejects a non-empty but severely truncated snapshot', () => {
    const currentIds = ['1', '2', '3', '4', '5', '6'];
    expect(isSuspiciousOfficialSnapshot(currentIds, new Set(['1']))).toBe(true);
  });

  it('accepts a complete replacement snapshot, such as a season rollover', () => {
    const currentIds = ['1', '2', '3', '4'];
    expect(isSuspiciousOfficialSnapshot(currentIds, new Set(['5', '6', '7', '8']))).toBe(false);
  });

  it('requires two consecutive absences before confirming a match missing', () => {
    const first = nextSourceMissingObservation(match());
    expect(first).toEqual({ confirmed: false, count: 1 });

    const second = nextSourceMissingObservation(match({
      sourceMissingObservations: first.count,
      sourceMissingSince: '2026-08-20T12:00:00.000Z',
      sourceStatus: 'active',
    }));
    expect(second).toEqual({ confirmed: true, count: 2 });
  });
});

const dbAvailable = process.env.CI ? true : await isDbAvailable();
const cleanupClubIds = new Set<string>();

describe.skipIf(!dbAvailable)('official match source identity reconciliation', () => {
  afterEach(async () => {
    if (cleanupClubIds.size === 0) return;
    const db = await getDb();
    for (const clubId of cleanupClubIds) {
      await db.getRepository('MatchExtra').delete({ clubId });
      await db.getRepository('MatchOfficial').delete({ clubId });
      await db
        .getRepository('AppMeta')
        .createQueryBuilder()
        .delete()
        .where('`key` LIKE :suffix', { suffix: `%:${clubId}` })
        .execute();
    }
    cleanupClubIds.clear();
  });

  it('keeps the internal match id and planning data when the scraper source id changes', async () => {
    const db = await getDb();
    const clubId = `reconcile-${Date.now()}`;
    cleanupClubIds.add(clubId);

    const internalId = 'legacy-source-123';
    await db.getRepository('MatchOfficial').save({
      id: internalId,
      clubId,
      date: '20/08/2026',
      time: '18:00',
      payload: match({
        id: internalId,
        sourceStatus: 'active',
        sourceLastSeenAt: '2026-08-19T10:00:00.000Z',
      }),
    });
    await db.getRepository('MatchExtra').save({
      matchId: internalId,
      clubId,
      payload: {
        id: internalId,
        planningStatus: 'published',
        planningRevision: 4,
        marker: 'planning-data-must-survive',
      },
    });

    const incoming: MatchesData = {
      club: { name: 'AFP 18', description: '', logo: '' },
      url: 'https://www.sportcorico.com/clubs/afp-18',
      scrapedAt: '2026-08-20T12:00:00.000Z',
      matches: {
        '20/08/2026': [match({
          id: 'new-source-987',
          time: '19:30',
          horaireRendezVous: '18:00',
        })],
      },
    };

    await syncOfficialMatchesData(db, incoming, clubId);

    const rows = await db.getRepository('MatchOfficial').findBy({ clubId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(internalId);
    expect(rows[0]?.time).toBe('19:30');
    expect(rows[0]?.payload).toMatchObject({
      id: internalId,
      sourceMatchId: 'new-source-987',
      sourceMatchIds: ['legacy-source-123', 'new-source-987'],
      sourceStatus: 'active',
    });

    const extra = await db.getRepository('MatchExtra').findOneByOrFail({ matchId: internalId });
    expect(extra.payload).toMatchObject({
      marker: 'planning-data-must-survive',
      planningRevision: 4,
      planningStatus: 'modified',
    });
  });
});
