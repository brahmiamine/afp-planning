import { describe, expect, it } from 'vitest';
import type { Match } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import {
  filterOfficialArchives,
  officialArchiveBadges,
  toOfficialArchiveRow,
} from './official-matches';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    type: 'officiel',
    date: '20/09/2026',
    time: '15:00',
    competition: 'Championnat',
    localTeam: 'AFP',
    awayTeam: 'Visiteur',
    venue: 'domicile',
    horaireRendezVous: '14:00',
    ...overrides,
  };
}

const tz = 'Europe/Paris';
const now = Date.UTC(2026, 8, 10, 12, 0, 0);

describe('officialArchiveBadges (issue #319)', () => {
  it('classe Passé, Disparu et Annulé indépendamment', () => {
    expect(officialArchiveBadges(match({ date: '01/08/2026' }), null, tz, now)).toEqual(['past']);
    expect(officialArchiveBadges(match({ sourceStatus: 'missing' }), null, tz, now)).toEqual(['missing']);
    expect(officialArchiveBadges(match(), { id: 'm1', planningStatus: 'cancelled' } satisfies MatchExtras, tz, now)).toEqual(['cancelled']);
    expect(officialArchiveBadges(
      match({ date: '01/08/2026', sourceStatus: 'missing' }),
      { id: 'm1', planningStatus: 'cancelled' },
      tz,
      now,
    )).toEqual(['past', 'missing', 'cancelled']);
  });

  it('n’archive pas un match futur encore actif', () => {
    expect(toOfficialArchiveRow(match({ date: '20/10/2026', sourceStatus: 'active' }), null, tz, now)).toBeNull();
  });
});

describe('filterOfficialArchives (issue #319)', () => {
  const rows = [
    toOfficialArchiveRow(match({ id: 'past', date: '01/08/2026', competition: 'Coupe', localTeam: 'AFP U15' }), null, tz, now)!,
    toOfficialArchiveRow(match({ id: 'gone', date: '20/10/2026', sourceStatus: 'missing', awayTeam: 'Autre Club' }), null, tz, now)!,
  ];

  it('filtre par recherche, année et badge, et trie par date décroissante', () => {
    expect(filterOfficialArchives(rows, { query: 'coupe' }).map((row) => row.id)).toEqual(['past']);
    expect(filterOfficialArchives(rows, { badge: 'missing' }).map((row) => row.id)).toEqual(['gone']);
    expect(filterOfficialArchives(rows).map((row) => row.id)).toEqual(['gone', 'past']);
  });
});
