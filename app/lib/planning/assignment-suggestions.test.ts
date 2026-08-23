import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';
import { buildAssignmentSuggestions } from './assignment-suggestions';
import { runWithClubId } from '@/lib/auth/club-context';

function fakeDb(): DataSource {
  const repositories: Record<string, unknown[]> = {
    User: [
      {
        id: 7,
        nom: 'Arbitre Préféré',
        telephone: '0600000000',
        indisponibilites: [],
        roles: ['arbitre'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    MatchOfficial: [],
    MatchAmical: [],
    Entrainement: [],
    Plateau: [],
    MatchExtra: [],
  };

  const preferencePayload = {
    preferredCategories: ['U15'],
    preferredWeekdays: [],
    preferredTimeRanges: [],
    preferredLocations: [],
    maxAssignmentsPerWeek: null,
    maxTravelMinutes: null,
  };

  return {
    getRepository(name: string) {
      return {
        find: async () => repositories[name] ?? [],
        findBy: async () => repositories[name] ?? [],
        findOneBy: async (where: Record<string, unknown>) =>
          (repositories[name] ?? []).find((row) =>
            Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
          ) ?? null,
      };
    },
    async query(sql: string, params?: unknown[]) {
      if (/^\s*CREATE TABLE/i.test(sql)) return {};
      if (sql.includes('FROM planning_records') && sql.includes('WHERE id = ?')) {
        if (params?.[0] !== 'person-preference:officiel:7') return [];
        return [{
          id: 'person-preference:officiel:7',
          kind: 'person-preference',
          eventType: null,
          eventId: null,
          ownerUserId: null,
          personType: 'officiel',
          personId: 7,
          payload: JSON.stringify(preferencePayload),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
      }
      return [];
    },
  } as unknown as DataSource;
}

const target: PlanningEventSnapshot = {
  eventId: 'm-1',
  eventType: 'officiel',
  title: 'AFP – Visiteur',
  date: '23/08/2026',
  time: '15:00',
  durationMinutes: 90,
  location: 'Stade AFP',
  planningStatus: 'published',
  event: {
    id: 'm-1',
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
  extras: { id: 'm-1', planningStatus: 'published' },
  assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
};

describe('buildAssignmentSuggestions preferences', () => {
  it('boosts a candidate whose preferred category matches the target event', async () => {
    const [suggestion] = await runWithClubId('afp', () => buildAssignmentSuggestions(fakeDb(), target, 'arbitre', 5));

    expect(suggestion).toBeDefined();
    expect(suggestion?.score).toBeGreaterThan(100);
    expect(suggestion?.reasons).toContain('Catégorie préférée : U15');
  });
});
