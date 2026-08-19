import { describe, it, expect } from 'vitest';
import { generateIcal } from './ical-export';
import { Match, Entrainement } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: 'match-1',
    date: '20/01/2026',
    time: '10:00',
    competition: 'D1',
    localTeam: 'Equipe A',
    awayTeam: 'Equipe B',
    venue: 'domicile',
    horaireRendezVous: '09:30',
    ...overrides,
  } as Match;
}

describe('generateIcal', () => {
  it('produces a valid VCALENDAR with balanced VEVENT blocks', () => {
    const match = makeMatch({});
    const ics = generateIcal([match], {});

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    const beginCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    const endCount = (ics.match(/END:VEVENT/g) || []).length;
    expect(beginCount).toBe(1);
    expect(endCount).toBe(1);
    expect(ics).toContain('SUMMARY:Equipe A vs Equipe B');
  });

  it('sets DTEND 90 minutes after DTSTART', () => {
    const match = makeMatch({ date: '20/01/2026', time: '10:00' });
    const ics = generateIcal([match], {});

    const dtstartMatch = ics.match(/DTSTART:(\d{8}T\d{6}Z)/);
    const dtendMatch = ics.match(/DTEND:(\d{8}T\d{6}Z)/);
    expect(dtstartMatch).toBeTruthy();
    expect(dtendMatch).toBeTruthy();

    const parseStamp = (s: string) =>
      Date.UTC(
        Number(s.slice(0, 4)),
        Number(s.slice(4, 6)) - 1,
        Number(s.slice(6, 8)),
        Number(s.slice(9, 11)),
        Number(s.slice(11, 13)),
      );

    const diffMinutes = (parseStamp(dtendMatch![1]!) - parseStamp(dtstartMatch![1]!)) / 60000;
    expect(diffMinutes).toBe(90);
  });

  it('filters events by assigned person when personNom is provided', () => {
    const matchWithArbitre = makeMatch({ id: 'match-1' });
    const matchWithoutArbitre = makeMatch({ id: 'match-2', localTeam: 'Equipe C', awayTeam: 'Equipe D' });
    const allExtras: Record<string, MatchExtras> = {
      'match-1': { id: 'match-1', arbitreTouche: [{ nom: 'Jean Dupont', numero: '' }] },
    };

    const ics = generateIcal([matchWithArbitre, matchWithoutArbitre], allExtras, undefined, {
      personNom: 'Jean Dupont',
      role: 'all',
    });

    expect(ics).toContain('match-1@afp-planning');
    expect(ics).not.toContain('match-2@afp-planning');
  });

  it('includes entrainement events with their lieu as LOCATION', () => {
    const entrainement: Entrainement = {
      id: 'ent-1',
      type: 'entrainement',
      date: '20/01/2026',
      time: '18:00',
      lieu: 'Stade Municipal',
    };

    const ics = generateIcal([entrainement], {});
    expect(ics).toContain('LOCATION:Stade Municipal');
  });

  it('skips events with an unparseable date', () => {
    const invalid = makeMatch({ id: 'bad', date: 'not-a-date' });
    const ics = generateIcal([invalid], {});
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
