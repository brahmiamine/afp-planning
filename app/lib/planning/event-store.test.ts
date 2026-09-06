import { describe, expect, it } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { runWithClubId } from '@/lib/auth/club-context';
import { listPlanningEventSnapshotsByKeys, saveRoleAssignments, type PlanningEventSnapshot } from './event-store';

interface Row {
  id?: string;
  matchId?: string;
  clubId: string;
  payload: Record<string, unknown>;
}

function makeDb(rows: Record<string, Row[]>): DataSource {
  return {
    getRepository: (name: string) => ({
      findBy: async (where: { clubId: string; id?: { _type: string; _value: string[] }; matchId?: { _type: string; _value: string[] } }) => {
        const table = rows[name] ?? [];
        const idFilter = where.id?._value;
        const matchIdFilter = where.matchId?._value;
        return table.filter((row) => {
          if (row.clubId !== where.clubId) return false;
          if (idFilter) return idFilter.includes(row.id!);
          if (matchIdFilter) return matchIdFilter.includes(row.matchId!);
          return true;
        });
      },
    }),
  } as unknown as DataSource;
}

describe('listPlanningEventSnapshotsByKeys', () => {
  it('returns an empty array without querying anything when no keys are given', async () => {
    const db = makeDb({});
    await runWithClubId('afp', async () => {
      expect(await listPlanningEventSnapshotsByKeys(db, [])).toEqual([]);
    });
  });

  it('only fetches the requested events, scoped by type and club', async () => {
    const db = makeDb({
      MatchAmical: [
        {
          id: 'a-1',
          clubId: 'afp',
          payload: {
            id: 'a-1', type: 'amical', date: '12/09/2026', time: '15:00',
            competition: 'Amical', localTeam: 'AFP', awayTeam: 'X', venue: 'domicile',
          },
        },
        {
          id: 'a-2',
          clubId: 'afp',
          payload: {
            id: 'a-2', type: 'amical', date: '13/09/2026', time: '15:00',
            competition: 'Amical', localTeam: 'AFP', awayTeam: 'Y', venue: 'domicile',
          },
        },
      ],
      Entrainement: [
        {
          id: 'e-1',
          clubId: 'afp',
          payload: { id: 'e-1', type: 'entrainement', date: '12/09/2026', time: '18:00', lieu: 'Stade' },
        },
      ],
    });

    await runWithClubId('afp', async () => {
      const snapshots = await listPlanningEventSnapshotsByKeys(db, [
        { eventType: 'amical', eventId: 'a-1' },
        { eventType: 'entrainement', eventId: 'e-1' },
      ]);
      const ids = snapshots.map((snapshot) => snapshot.eventId).sort();
      expect(ids).toEqual(['a-1', 'e-1']);
    });
  });
});

describe('saveRoleAssignments — miroir du store d’état opérationnel (issue #41)', () => {
  it('mirrore chaque contact dans planning_assignment_state, dans la même transaction', async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const extraRow = { matchId: 'm-1', clubId: 'afp', payload: { id: 'm-1', planningRevision: 3 } };
    const manager = {
      getRepository: () => ({
        findOne: async () => extraRow,
        save: async (row: unknown) => row,
      }),
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        return [];
      },
    } as unknown as EntityManager;
    const db = {
      transaction: async <T>(work: (m: EntityManager) => Promise<T>) => work(manager),
    } as unknown as DataSource;
    const snapshot = {
      eventId: 'm-1',
      eventType: 'amical',
      revision: 3,
    } as PlanningEventSnapshot;

    await runWithClubId('afp', () =>
      saveRoleAssignments(db, snapshot, 'arbitre', [
        {
          nom: 'Jean Dupont',
          numero: '',
          personId: 7,
          personType: 'officiel',
          status: 'accepted',
          respondedAt: '2026-08-20T10:00:00.000Z',
        },
      ]));

    const upserts = queries.filter(
      (call) => call.sql.includes('planning_assignment_state') && call.sql.trimStart().startsWith('INSERT'),
    );
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(upserts[0]?.params.slice(0, 5)).toEqual(['afp', 'amical', 'm-1', 'arbitre', 'id:officiel:7']);
    expect(JSON.parse(String(upserts[0]?.params[8]))).toMatchObject({
      status: 'accepted',
      respondedAt: '2026-08-20T10:00:00.000Z',
    });
  });
});
