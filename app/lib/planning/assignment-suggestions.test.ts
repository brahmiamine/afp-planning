import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { UserEntity } from '@/lib/db/schemas';
import type { PlanningEventSnapshot } from './event-store';
import { buildAssignmentSuggestions, candidateHasOverlappingAssignment } from './assignment-suggestions';
import { runWithClubId } from '@/lib/auth/club-context';

/**
 * Complète un mock de repository avec les méthodes utilisées par readAppSettings
 * (findOneBy sur ClubTenant, puis findOne sur AppMeta, create/save à la création)
 * depuis que buildAssignmentSettings lit le fuseau horaire du club (issue #45).
 */
function withSettingsSupport(repo: Record<string, unknown>): Record<string, unknown> {
  return {
    findOne: async () => null,
    create: (value: unknown) => value,
    save: async (value: unknown) => value,
    ...repo,
  };
}

function fakeDb(): DataSource {
  const repositories: Record<string, unknown[]> = {
    User: [
      {
        id: 7,
        nom: 'Arbitre Préféré',
        telephone: '0600000000',
        indisponibilites: [],
        accessRole: 'dirigeant',
        planningFunctions: ['arbitre_club'],
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
      return withSettingsSupport({
        find: async () => repositories[name] ?? [],
        findBy: async () => repositories[name] ?? [],
        findOneBy: async (where: Record<string, unknown>) =>
          (repositories[name] ?? []).find((row) =>
            Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
          ) ?? null,
      });
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

describe('candidateHasOverlappingAssignment (issue #205)', () => {
  const candidate = { id: 42, nom: 'Dirigeant' } as UserEntity;

  function makeSnapshot(overrides: Partial<PlanningEventSnapshot>): PlanningEventSnapshot {
    return {
      eventId: 'm-2',
      eventType: 'officiel',
      title: 'Autre événement',
      date: '23/08/2026',
      time: '15:30',
      durationMinutes: 90,
      location: null,
      planningStatus: 'draft',
      event: {} as never,
      extras: null,
      assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
      ...overrides,
    };
  }

  it('flags a conflict for the same person holding a different function on an overlapping event', () => {
    const other = makeSnapshot({
      assignments: {
        arbitre: [],
        encadrant: [{ nom: 'Dirigeant', numero: '', personId: 42, personType: 'encadrant' }],
        accompagnateur: [],
      },
    });

    expect(candidateHasOverlappingAssignment([other], candidate, target, 'UTC')).toBe(true);
  });

  it('flags a conflict between two still-draft overlapping events', () => {
    const other = makeSnapshot({
      planningStatus: 'draft',
      assignments: {
        arbitre: [{ nom: 'Dirigeant', numero: '', personId: 42, personType: 'officiel' }],
        encadrant: [],
        accompagnateur: [],
      },
    });
    const draftTarget: PlanningEventSnapshot = { ...target, planningStatus: 'draft' };

    expect(candidateHasOverlappingAssignment([other], candidate, draftTarget, 'UTC')).toBe(true);
  });

  it('ignores a cancelled overlapping event', () => {
    const other = makeSnapshot({
      planningStatus: 'cancelled',
      assignments: {
        arbitre: [{ nom: 'Dirigeant', numero: '', personId: 42, personType: 'officiel' }],
        encadrant: [],
        accompagnateur: [],
      },
    });

    expect(candidateHasOverlappingAssignment([other], candidate, target, 'UTC')).toBe(false);
  });

  it('ignores a non-overlapping event', () => {
    const other = makeSnapshot({ time: '20:00' });

    expect(candidateHasOverlappingAssignment([other], candidate, target, 'UTC')).toBe(false);
  });
});

describe('buildAssignmentSuggestions active filter', () => {
  function dbWithUsers(users: Array<Record<string, unknown>>): DataSource {
    return {
      getRepository(name: string) {
        if (name === 'User') {
          return withSettingsSupport({
            find: async ({ where }: { where?: Record<string, unknown> } = {}) =>
              users.filter((user) => Object.entries(where ?? {}).every(([key, value]) => user[key] === value)),
          });
        }
        return withSettingsSupport({
          find: async () => [],
          findBy: async () => [],
          findOneBy: async () => null,
        });
      },
      async query(sql: string) {
        if (/^\s*CREATE TABLE/i.test(sql)) return {};
        return [];
      },
    } as unknown as DataSource;
  }

  it('excludes an inactive account from suggestions even if it still holds the role', async () => {
    const db = dbWithUsers([
      { id: 7, nom: 'Actif', telephone: '0600000000', indisponibilites: [], accessRole: 'dirigeant', planningFunctions: ['arbitre_club'], active: true, clubId: 'afp' },
      { id: 8, nom: 'Inactif', telephone: '0600000001', indisponibilites: [], accessRole: 'dirigeant', planningFunctions: ['arbitre_club'], active: false, clubId: 'afp' },
    ]);

    const suggestions = await runWithClubId('afp', () => buildAssignmentSuggestions(db, target, 'arbitre', 5));

    expect(suggestions.some((item) => item.nom === 'Actif')).toBe(true);
    expect(suggestions.some((item) => item.nom === 'Inactif')).toBe(false);
  });
});
