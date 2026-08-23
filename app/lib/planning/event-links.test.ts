import { describe, expect, it } from 'vitest';
import type { Entrainement, Match, Plateau } from '@/types/match';
import { eventWorkspaceHref, planningEventTypeFromEvent } from './event-links';

describe('eventWorkspaceHref', () => {
  it('builds the canonical club event workspace route and encodes the id', () => {
    expect(eventWorkspaceHref('officiel', 'match 42/Paris')).toBe(
      '/club/evenements/officiel/match%2042%2FParis',
    );
  });
});

describe('planningEventTypeFromEvent', () => {
  it('treats matches without an explicit type as official matches', () => {
    const match = {
      id: 'm-1',
      date: '23/08/2026',
      time: '15:00',
      competition: 'Championnat',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '14:00',
    } satisfies Match;

    expect(planningEventTypeFromEvent(match)).toBe('officiel');
  });

  it('preserves friendly, training and plateau event types', () => {
    const friendly = {
      id: 'a-1',
      type: 'amical',
      date: '23/08/2026',
      time: '15:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
      horaireRendezVous: '14:00',
    } satisfies Match;
    const training = {
      id: 'e-1',
      type: 'entrainement',
      date: '23/08/2026',
      time: '18:00',
      lieu: 'Stade AFP',
    } satisfies Entrainement;
    const plateau = {
      id: 'p-1',
      type: 'plateau',
      date: '23/08/2026',
      time: '10:00',
      lieu: 'Stade AFP',
    } satisfies Plateau;

    expect(planningEventTypeFromEvent(friendly)).toBe('amical');
    expect(planningEventTypeFromEvent(training)).toBe('entrainement');
    expect(planningEventTypeFromEvent(plateau)).toBe('plateau');
  });
});
