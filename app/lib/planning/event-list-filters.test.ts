import { describe, expect, it } from 'vitest';
import type { Match, Entrainement, Plateau } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { eventTypeOf, filterEventsByDate, hasActiveFilters } from './event-list-filters';
import type { MatchFilters } from '@/components/matches/MatchFilters';

const DEFAULT_FILTERS: MatchFilters = { clubSearch: '', arbitreAFPSearch: '', venue: 'all', eventType: 'all' };

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    type: 'officiel',
    date: '20/09/2026',
    time: '15:00',
    competition: 'Championnat',
    localTeam: 'AFP',
    awayTeam: 'Visiteurs FC',
    venue: 'domicile',
    horaireRendezVous: '14:00',
    ...overrides,
  };
}

function entrainement(overrides: Partial<Entrainement> = {}): Entrainement {
  return {
    id: 'training-1',
    type: 'entrainement',
    date: '20/09/2026',
    time: '18:00',
    lieu: 'Terrain A',
    ...overrides,
  };
}

function plateau(overrides: Partial<Plateau> = {}): Plateau {
  return {
    id: 'plateau-1',
    type: 'plateau',
    date: '21/09/2026',
    time: '09:00',
    lieu: 'Terrain B',
    ...overrides,
  };
}

describe('hasActiveFilters', () => {
  it('is false for the default filter set', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it('is true as soon as one field is set', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, eventType: 'entrainement' })).toBe(true);
  });
});

describe('eventTypeOf', () => {
  it('infers officiel from match-shaped fields even without an explicit type', () => {
    const m = match({ type: undefined });
    expect(eventTypeOf(m)).toBe('officiel');
  });

  it('reads the explicit type for entrainement/plateau', () => {
    expect(eventTypeOf(entrainement())).toBe('entrainement');
    expect(eventTypeOf(plateau())).toBe('plateau');
  });
});

describe('filterEventsByDate (issue #189)', () => {
  it('returns the input unchanged when no filter is active', () => {
    const events = { '20/09/2026': [match(), entrainement()] };
    expect(filterEventsByDate(events, DEFAULT_FILTERS, undefined)).toBe(events);
  });

  it('filters by event type, dropping dates left empty', () => {
    const events = {
      '20/09/2026': [match(), entrainement()],
      '21/09/2026': [plateau()],
    };
    const result = filterEventsByDate(events, { ...DEFAULT_FILTERS, eventType: 'entrainement' }, undefined);
    expect(Object.keys(result)).toEqual(['20/09/2026']);
    expect(result['20/09/2026']).toEqual([entrainement()]);
  });

  it('filters matches by venue, excluding non-match events entirely', () => {
    const events = {
      '20/09/2026': [match({ venue: 'domicile' }), match({ id: 'match-2', venue: 'extérieur' }), entrainement()],
    };
    const result = filterEventsByDate(events, { ...DEFAULT_FILTERS, venue: 'domicile' }, undefined);
    expect(result['20/09/2026']).toEqual([match({ venue: 'domicile' })]);
  });

  it('filters matches by club name search across local and away teams', () => {
    const events = {
      '20/09/2026': [
        match({ id: 'a', localTeam: 'AFP', awayTeam: 'Racing' }),
        match({ id: 'b', localTeam: 'Olympique', awayTeam: 'AFP' }),
        match({ id: 'c', localTeam: 'Stade', awayTeam: 'Autre' }),
      ],
    };
    const result = filterEventsByDate(events, { ...DEFAULT_FILTERS, clubSearch: 'afp' }, undefined);
    expect(result['20/09/2026']?.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('filters by assigned "arbitre AFP" using the extras overlay, keyed by match id', () => {
    const events = {
      '20/09/2026': [match({ id: 'has-arbitre' }), match({ id: 'no-arbitre' })],
    };
    const allExtras: Record<string, MatchExtras> = {
      'has-arbitre': { id: 'has-arbitre', arbitreTouche: [{ nom: 'Jean Dupont', numero: '' }] },
    };
    const result = filterEventsByDate(events, { ...DEFAULT_FILTERS, arbitreAFPSearch: 'dupont' }, allExtras);
    expect(result['20/09/2026']?.map((e) => e.id)).toEqual(['has-arbitre']);
  });

  it('combines filters conjunctively', () => {
    const events = {
      '20/09/2026': [
        match({ id: 'a', venue: 'domicile', localTeam: 'AFP', awayTeam: 'X' }),
        match({ id: 'b', venue: 'extérieur', localTeam: 'AFP', awayTeam: 'X' }),
      ],
    };
    const result = filterEventsByDate(events, { ...DEFAULT_FILTERS, venue: 'domicile', clubSearch: 'afp' }, undefined);
    expect(result['20/09/2026']?.map((e) => e.id)).toEqual(['a']);
  });
});
