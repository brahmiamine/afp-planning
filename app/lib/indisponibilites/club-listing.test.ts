import { describe, expect, it } from 'vitest';
import {
  filterClubIndisponibilites,
  flattenClubIndisponibilites,
  type ClubIndisponibiliteUser,
} from './club-listing';

const now = new Date(2026, 8, 10, 12, 0, 0, 0);

function user(partial: Partial<ClubIndisponibiliteUser> & Pick<ClubIndisponibiliteUser, 'id' | 'nom'>): ClubIndisponibiliteUser {
  return {
    planningFunctions: [],
    indisponibilites: [],
    ...partial,
  };
}

describe('flattenClubIndisponibilites (issue #320)', () => {
  it('distingue période, créneau horaire et les trois statuts temporels', () => {
    const rows = flattenClubIndisponibilites([
      user({
        id: 1,
        nom: 'Alice Multi',
        planningFunctions: ['arbitre_club', 'encadrant'],
        indisponibilites: [
          { id: 'past', type: 'day-range', dateStart: '01/08/2026', dateEnd: '03/08/2026' },
          { id: 'current', type: 'day-range', dateStart: '08/09/2026', dateEnd: '12/09/2026' },
          { id: 'slot', type: 'time-slot', date: '20/09/2026', startTime: '09:00', endTime: '11:00' },
        ],
      }),
    ], now);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.planningFunctionLabels)).toEqual([
      ['Arbitre club', 'Encadrant'],
      ['Arbitre club', 'Encadrant'],
      ['Arbitre club', 'Encadrant'],
    ]);

    const byId = Object.fromEntries(rows.map((row) => [row.id.split(':')[1], row]));
    expect(byId.past).toMatchObject({
      typeLabel: 'Journée / période',
      temporalLabel: 'Passée',
      dateStart: '01/08/2026',
      dateEnd: '03/08/2026',
    });
    expect(byId.current).toMatchObject({
      typeLabel: 'Journée / période',
      temporalLabel: 'En cours',
    });
    expect(byId.slot).toMatchObject({
      typeLabel: 'Créneau horaire',
      temporalLabel: 'Future',
      startTime: '09:00',
      endTime: '11:00',
    });
  });
});

describe('filterClubIndisponibilites (issue #320)', () => {
  const rows = flattenClubIndisponibilites([
    user({
      id: 1,
      nom: 'Alice Dupont',
      planningFunctions: ['arbitre_club', 'encadrant'],
      indisponibilites: [
        { id: 'a', type: 'day-range', dateStart: '01/10/2026', dateEnd: '02/10/2026' },
      ],
    }),
    user({
      id: 2,
      nom: 'Bob Martin',
      planningFunctions: ['accompagnateur'],
      indisponibilites: [
        { id: 'b', type: 'time-slot', date: '01/08/2026', startTime: '10:00', endTime: '12:00' },
      ],
    }),
  ], now);

  it('filtre par nom, fonction et statut temporel', () => {
    expect(filterClubIndisponibilites(rows, { query: 'alice' }).map((row) => row.userName)).toEqual(['Alice Dupont']);
    expect(filterClubIndisponibilites(rows, { planningFunction: 'encadrant' }).map((row) => row.userName)).toEqual(['Alice Dupont']);
    expect(filterClubIndisponibilites(rows, { temporalStatus: 'past' }).map((row) => row.userName)).toEqual(['Bob Martin']);
  });

  it('trie chronologiquement', () => {
    const asc = filterClubIndisponibilites(rows, { sort: 'chrono-asc' });
    expect(asc.map((row) => row.userName)).toEqual(['Bob Martin', 'Alice Dupont']);
    const desc = filterClubIndisponibilites(rows, { sort: 'chrono-desc' });
    expect(desc.map((row) => row.userName)).toEqual(['Alice Dupont', 'Bob Martin']);
  });
});
