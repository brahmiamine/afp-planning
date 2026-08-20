import { describe, expect, it } from 'vitest';
import type { PlanningEventSnapshot } from './event-store';
import { computePlanningAnalytics, fairnessCoefficient } from './analytics';

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'event-1',
    eventType: 'officiel',
    title: 'AFP – Visiteur',
    date: '16/08/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'published',
    event: {
      id: 'event-1',
      type: 'officiel',
      date: '16/08/2026',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Championnat',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: 'event-1', planningStatus: 'published' },
    assignments: {
      arbitre: [{
        nom: 'Arbitre A',
        numero: '',
        personType: 'officiel',
        personId: 1,
        status: 'accepted',
        assignedAt: '2026-08-10T10:00:00.000Z',
        respondedAt: '2026-08-10T11:00:00.000Z',
        attendanceStatus: 'present',
      }],
      encadrant: [{
        nom: 'Encadrant B',
        numero: '',
        personType: 'encadrant',
        personId: 2,
        status: 'declined',
        assignedAt: '2026-08-10T10:00:00.000Z',
        respondedAt: '2026-08-10T12:00:00.000Z',
      }],
      accompagnateur: [],
    },
    ...overrides,
  };
}

describe('planning analytics', () => {
  it('computes acceptance, attendance, response delay, replacement and missing coverage rates', () => {
    const training = snapshot({
      eventId: 'event-2',
      eventType: 'entrainement',
      title: 'Entraînement U15',
      event: {
        id: 'event-2',
        type: 'entrainement',
        date: '17/08/2026',
        time: '18:00',
        lieu: 'Terrain 2',
        categorie: 'U15',
        encadrants: [{
          nom: 'Encadrant B',
          numero: '',
          personType: 'encadrant',
          personId: 2,
          status: 'accepted',
          assignedAt: '2026-08-10T10:00:00.000Z',
          respondedAt: '2026-08-10T10:30:00.000Z',
          attendanceStatus: 'absent',
        }],
      },
      extras: null,
      assignments: {
        arbitre: [],
        encadrant: [{
          nom: 'Encadrant B',
          numero: '',
          personType: 'encadrant',
          personId: 2,
          status: 'accepted',
          assignedAt: '2026-08-10T10:00:00.000Z',
          respondedAt: '2026-08-10T10:30:00.000Z',
          attendanceStatus: 'absent',
        }],
        accompagnateur: [],
      },
    });

    const result = computePlanningAnalytics([snapshot(), training]);

    expect(result.acceptanceRate).toBeCloseTo(66.67, 1);
    expect(result.attendanceRate).toBe(50);
    expect(result.averageResponseDelayMinutes).toBe(70);
    expect(result.replacementRate).toBeCloseTo(33.33, 1);
    // 4 required role slots: 3 on the match + 1 on training. The declined encadrant
    // and absent accompagnateur leave two match roles uncovered, so 2 / 4 = 50%.
    expect(result.missingCoverageRate).toBe(50);
    expect(result.workload).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: 'encadrant:2', assignments: 2 }),
      expect.objectContaining({ identity: 'officiel:1', assignments: 1 }),
    ]));
  });

  it('returns a normalized fairness coefficient where equal workloads are fairest', () => {
    expect(fairnessCoefficient([2, 2])).toBe(1);
    expect(fairnessCoefficient([4, 0])).toBe(0.5);
    expect(fairnessCoefficient([])).toBe(1);
  });
});
