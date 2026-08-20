import { describe, expect, it } from 'vitest';
import type { PlanningEventSnapshot } from './event-store';
import { assessPublicationReadiness, validateAssignmentSet } from './validation';

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'match-1',
    eventType: 'officiel',
    title: 'AFP – Visiteur',
    date: '23/08/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'draft',
    event: {
      id: 'match-1',
      type: 'officiel',
      date: '23/08/2026',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Championnat',
      categorie: 'U15',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: 'match-1' },
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    ...overrides,
  };
}

describe('assessPublicationReadiness', () => {
  it('blocks publication when a required role is not covered', () => {
    const result = assessPublicationReadiness(snapshot());

    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.code)).toEqual([
      'missing-arbitre',
      'missing-encadrant',
      'missing-accompagnateur',
    ]);
  });

  it('does not count declined contacts as role coverage', () => {
    const result = assessPublicationReadiness(snapshot({
      assignments: {
        arbitre: [{ nom: 'Arbitre', numero: '', status: 'declined' }],
        encadrant: [{ nom: 'Coach', numero: '', status: 'accepted' }],
        accompagnateur: [{ nom: 'Parent', numero: '', status: 'pending' }],
      },
    }));

    expect(result.blockers.map((item) => item.code)).toContain('missing-arbitre');
  });

  it('requires only an encadrant for trainings and plateaux', () => {
    const result = assessPublicationReadiness(snapshot({
      eventType: 'entrainement',
      assignments: {
        arbitre: [],
        encadrant: [{ nom: 'Coach', numero: '', status: 'pending' }],
        accompagnateur: [],
      },
    }));

    expect(result).toEqual({ ready: true, blockers: [] });
  });

  it('blocks invalid dates and times', () => {
    const result = assessPublicationReadiness(snapshot({ date: 'inconnue', time: '' }));

    expect(result.blockers.map((item) => item.code)).toContain('invalid-schedule');
  });
});

describe('validateAssignmentSet', () => {
  it('detects an unavailable linked person', () => {
    const result = validateAssignmentSet({
      target: snapshot(),
      role: 'arbitre',
      contacts: [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' }],
      people: [{ id: 7, nom: 'Arbitre', indisponibilites: [{ id: 'off', type: 'day-range', dateStart: '23/08/2026', dateEnd: '23/08/2026' }] }],
      snapshots: [],
    });

    expect(result.map((item) => item.code)).toContain('unavailable');
  });

  it('detects a conflicting published assignment', () => {
    const other = snapshot({
      eventId: 'match-2',
      time: '15:30',
      planningStatus: 'published',
      assignments: {
        arbitre: [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' }],
        encadrant: [],
        accompagnateur: [],
      },
    });
    const result = validateAssignmentSet({
      target: snapshot(),
      role: 'arbitre',
      contacts: [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' }],
      people: [{ id: 7, nom: 'Arbitre', indisponibilites: [] }],
      snapshots: [other],
    });

    expect(result.map((item) => item.code)).toContain('conflict');
  });

  it('rejects new name-only assignments that cannot be checked', () => {
    const result = validateAssignmentSet({
      target: snapshot(),
      role: 'arbitre',
      contacts: [{ nom: 'Arbitre historique', numero: '' }],
      people: [],
      snapshots: [],
    });

    expect(result.map((item) => item.code)).toContain('unlinked-person');
  });
});
