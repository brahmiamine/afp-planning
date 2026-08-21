import { describe, expect, it } from 'vitest';
import type { Match } from '@/types/match';
import {
  isSuspiciousOfficialSnapshot,
  nextSourceMissingObservation,
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
