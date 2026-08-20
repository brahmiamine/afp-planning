import { describe, it, expect } from 'vitest';
import { checkPersonConflict, checkLocationConflict } from './assignment-conflicts';
import { Match, Entrainement } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: 'match-1',
    date: '20/01/2026',
    time: '10:00',
    competition: 'D1',
    localTeam: 'A',
    awayTeam: 'B',
    venue: 'domicile',
    horaireRendezVous: '09:30',
    ...overrides,
  } as Match;
}

describe('checkPersonConflict', () => {
  it('detects a conflict when the same person is assigned to two overlapping matches', () => {
    const target = makeMatch({ id: 'match-target', time: '10:00' });
    const other = makeMatch({ id: 'match-other', time: '10:30' });
    const allExtras: Record<string, MatchExtras> = {
      'match-other': { id: 'match-other', arbitreTouche: [{ nom: 'Jean Dupont', numero: '' }] },
    };

    const result = checkPersonConflict('Jean Dupont', 'arbitre', target, [other], allExtras);
    expect(result.conflict).toBe(true);
    expect(result.conflictingEvent?.id).toBe('match-other');
  });

  it('does not conflict when events are more than 90 minutes apart', () => {
    const target = makeMatch({ id: 'match-target', time: '10:00' });
    const other = makeMatch({ id: 'match-other', time: '13:00' });
    const allExtras: Record<string, MatchExtras> = {
      'match-other': { id: 'match-other', arbitreTouche: [{ nom: 'Jean Dupont', numero: '' }] },
    };

    const result = checkPersonConflict('Jean Dupont', 'arbitre', target, [other], allExtras);
    expect(result.conflict).toBe(false);
  });

  it('does not conflict on a different date even at the same time', () => {
    const target = makeMatch({ id: 'match-target', date: '20/01/2026', time: '10:00' });
    const other = makeMatch({ id: 'match-other', date: '21/01/2026', time: '10:00' });
    const allExtras: Record<string, MatchExtras> = {
      'match-other': { id: 'match-other', arbitreTouche: [{ nom: 'Jean Dupont', numero: '' }] },
    };

    const result = checkPersonConflict('Jean Dupont', 'arbitre', target, [other], allExtras);
    expect(result.conflict).toBe(false);
  });

  it('checks encadrants assigned directly on entrainement/plateau events', () => {
    const target: Entrainement = {
      id: 'ent-target',
      type: 'entrainement',
      date: '20/01/2026',
      time: '10:00',
      lieu: 'Stade A',
    };
    const other: Entrainement = {
      id: 'ent-other',
      type: 'entrainement',
      date: '20/01/2026',
      time: '10:15',
      lieu: 'Stade B',
      encadrants: [{ nom: 'Marie Curie', numero: '' }],
    };

    const result = checkPersonConflict('Marie Curie', 'encadrant', target, [other], {});
    expect(result.conflict).toBe(true);
  });

  it('uses the real event duration instead of only comparing start times', () => {
    const target = makeMatch({ id: 'match-target', time: '10:00', durationMinutes: 180 });
    const other = makeMatch({ id: 'match-other', time: '12:00' });
    const allExtras: Record<string, MatchExtras> = {
      'match-other': { id: 'match-other', arbitreTouche: [{ nom: 'Jean Dupont', numero: '' }] },
    };

    const result = checkPersonConflict('Jean Dupont', 'arbitre', target, [other], allExtras);
    expect(result.conflict).toBe(true);
  });
});

describe('checkLocationConflict', () => {
  it('detects two events sharing the same stade within 90 minutes', () => {
    const target = makeMatch({
      id: 'match-target',
      time: '10:00',
      details: { stadium: 'Stade Municipal', dateTime: '', competition: '', address: '', terrainType: '', itineraryLink: '', rawText: '' },
    });
    const other = makeMatch({
      id: 'match-other',
      time: '10:45',
      details: { stadium: 'Stade Municipal', dateTime: '', competition: '', address: '', terrainType: '', itineraryLink: '', rawText: '' },
    });

    const result = checkLocationConflict(target, [other]);
    expect(result.conflict).toBe(true);
  });

  it('does not conflict when stadiums differ', () => {
    const target = makeMatch({
      id: 'match-target',
      time: '10:00',
      details: { stadium: 'Stade A', dateTime: '', competition: '', address: '', terrainType: '', itineraryLink: '', rawText: '' },
    });
    const other = makeMatch({
      id: 'match-other',
      time: '10:15',
      details: { stadium: 'Stade B', dateTime: '', competition: '', address: '', terrainType: '', itineraryLink: '', rawText: '' },
    });

    const result = checkLocationConflict(target, [other]);
    expect(result.conflict).toBe(false);
  });

  it('uses the configured duration when checking stadium occupancy', () => {
    const target = makeMatch({
      id: 'match-target',
      time: '10:00',
      durationMinutes: 180,
      details: { stadium: 'Stade Municipal', dateTime: '', competition: '', address: '', terrainType: '', itineraryLink: '', rawText: '' },
    });
    const other = makeMatch({
      id: 'match-other',
      time: '12:00',
      details: { stadium: 'Stade Municipal', dateTime: '', competition: '', address: '', terrainType: '', itineraryLink: '', rawText: '' },
    });

    const result = checkLocationConflict(target, [other]);
    expect(result.conflict).toBe(true);
  });
});
