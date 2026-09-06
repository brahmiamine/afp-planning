import { describe, expect, it } from 'vitest';
import type { AssignmentContact } from '@/types/match';
import type { PlanningEventSnapshot } from './event-store';
import { DEFAULT_PUBLICATION_ROLE_REQUIREMENTS } from './validation';
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
    ], DEFAULT_PUBLICATION_ROLE_REQUIREMENTS, now);

    expect(result.total).toBe(3);
    expect(result.ready).toBe(1);
    expect(result.attention).toBe(2);
    expect(result.items.find((item) => item.eventId === 'match-published-false')?.readiness).toBe('ready');
    expect(result.items.find((item) => item.eventId === 'match-published-true')?.pending).toBe(1);
  });

  it('stops reporting a missing arbitre once the club disables that requirement', () => {
    const now = Date.UTC(2026, 7, 20, 10, 0, 0);
    const withoutArbitre = match('published');
    withoutArbitre.assignments.arbitre = [];

    const withRequirement = buildWeekendPlanning([withoutArbitre], DEFAULT_PUBLICATION_ROLE_REQUIREMENTS, now);
    expect(withRequirement.items[0]?.missingRoles).toContain('arbitre');
    expect(withRequirement.items[0]?.readiness).toBe('attention');

    const withoutRequirement = buildWeekendPlanning(
      [withoutArbitre],
      { ...DEFAULT_PUBLICATION_ROLE_REQUIREMENTS, arbitre: false },
      now,
    );
    expect(withoutRequirement.items[0]?.missingRoles).not.toContain('arbitre');
    expect(withoutRequirement.items[0]?.readiness).toBe('ready');
  });

  it('a declined contact already replaced does not block readiness (issue #78)', () => {
    const now = Date.UTC(2026, 7, 20, 10, 0, 0);
    const replaced = match('published');
    replaced.eventId = 'match-replaced';
    replaced.assignments.arbitre = [
      { ...accepted('Ancien Arbitre', 9, 'officiel'), status: 'declined' },
      accepted('Arbitre', 1, 'officiel'),
    ];

    const result = buildWeekendPlanning([replaced], DEFAULT_PUBLICATION_ROLE_REQUIREMENTS, now);

    expect(result.items[0]?.readiness).toBe('ready');
    // Le refus reste visible comme information.
    expect(result.items[0]?.declined).toBe(1);
  });

  it('an event whose only contact declined stays attention (needsReplacement)', () => {
    const now = Date.UTC(2026, 7, 20, 10, 0, 0);
    const allDeclined = match('published');
    allDeclined.eventId = 'match-all-declined';
    allDeclined.assignments.arbitre = [{ ...accepted('Arbitre', 1, 'officiel'), status: 'declined' }];

    const result = buildWeekendPlanning([allDeclined], DEFAULT_PUBLICATION_ROLE_REQUIREMENTS, now);

    expect(result.items[0]?.readiness).toBe('attention');
    expect(result.items[0]?.replacementRoles).toContain('arbitre');
  });
});
