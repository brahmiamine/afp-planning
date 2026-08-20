import { describe, expect, it } from 'vitest';
import type { AssignmentContact } from '@/types/match';
import type { PlanningEventSnapshot } from './event-store';
import { buildWeekendPlanning } from './weekend';

const accepted = (nom: string, personId: number, personType: AssignmentContact['personType']): AssignmentContact => ({
  nom,
  numero: '',
  personId,
  personType,
  status: 'accepted',
});

function match(status: PlanningEventSnapshot['planningStatus'], pending = false): PlanningEventSnapshot {
  return {
    eventId: `match-${status}-${pending}`,
    eventType: 'officiel',
    title: 'AFP – Visiteur',
    date: '22/08/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: status,
    event: {
      id: `match-${status}-${pending}`,
      type: 'officiel',
      date: '22/08/2026',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Championnat',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: `match-${status}-${pending}`, planningStatus: status },
    assignments: {
      arbitre: [pending ? { ...accepted('Arbitre', 1, 'officiel'), status: 'pending' } : accepted('Arbitre', 1, 'officiel')],
      encadrant: [accepted('Encadrant', 2, 'encadrant')],
      accompagnateur: [accepted('Accompagnateur', 3, 'accompagnateur')],
    },
  };
}

describe('weekend planning readiness', () => {
  it('marks a fully accepted published event ready and draft/pending events as attention', () => {
    const now = Date.UTC(2026, 7, 20, 10, 0, 0);
    const result = buildWeekendPlanning([
      match('published'),
      match('draft'),
      match('published', true),
    ], now);

    expect(result.total).toBe(3);
    expect(result.ready).toBe(1);
    expect(result.attention).toBe(2);
    expect(result.items.find((item) => item.eventId === 'match-published-false')?.readiness).toBe('ready');
    expect(result.items.find((item) => item.eventId === 'match-published-true')?.pending).toBe(1);
  });
});
