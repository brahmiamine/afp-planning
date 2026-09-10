import { describe, expect, it } from 'vitest';
import { getCurrentClubId, runWithClubId } from '@/lib/auth/club-context';
import { getPlanningRecord } from './records';

describe('planning records club scope', () => {
  it('getCurrentClubId throws without active ALS', () => {
    expect(() => getCurrentClubId()).toThrow(/Contexte club manquant/);
  });

  it('getPlanningRecord requires ALS and does not fall back to APP_CLUB_ID', async () => {
    const previous = process.env.APP_CLUB_ID;
    process.env.APP_CLUB_ID = 'fallback-club-should-not-be-used';

    try {
      await expect(getPlanningRecord({ query: async () => [] } as never, 'test:missing')).rejects.toThrow(
        /Contexte club manquant/,
      );
    } finally {
      if (previous === undefined) delete process.env.APP_CLUB_ID;
      else process.env.APP_CLUB_ID = previous;
    }
  });

  it('uses ALS club id when scoped', async () => {
    const queries: unknown[][] = [];
    const db = {
      query: async (sql: string, params: unknown[]) => {
        queries.push(params);
        return [];
      },
    };

    await runWithClubId('club-test-a', () => getPlanningRecord(db as never, 'rec-1'));

    expect(queries[0]?.[1]).toBe('club-test-a');
  });
});
