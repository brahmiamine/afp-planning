import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';
import { buildAssignmentSuggestions } from './assignment-suggestions';
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

describe('buildAssignmentSuggestions availability responses (issue #86)', () => {
  function dbWithAvailability(planningRecords: Record<string, unknown>[]): DataSource {
    return {
      getRepository(name: string) {
        return withSettingsSupport({
          find: async () => (name === 'User' ? [
            { id: 7, nom: 'Arbitre', telephone: '0600000000', indisponibilites: [], accessRole: 'dirigeant', planningFunctions: ['arbitre_club'], active: true, clubId: 'afp' },
          ] : []),
          findBy: async () => [],
          findOneBy: async () => null,
        });
      },
      async query(sql: string, params?: unknown[]) {
        if (/^\s*CREATE TABLE/i.test(sql)) return {};
        if (!sql.includes('FROM planning_records')) return [];
        const kind = params?.[1];
        const eventId = params?.[2];
        return planningRecords.filter((row) =>
          row.kind === kind && (eventId === undefined || row.eventId === eventId));
      },
    } as unknown as DataSource;
  }

  function campaignRecord(id: string, startDate: string, endDate: string): Record<string, unknown> {
    return {
      id,
      kind: 'availability-request',
      eventType: null,
      eventId: null,
      ownerUserId: null,
      personType: null,
      personId: null,
      payload: JSON.stringify({ startDate, endDate, targetRoles: ['arbitre_club'] }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function responseRecord(campaignId: string, userId: number, payload: Record<string, unknown>): Record<string, unknown> {
    return {
      id: `availability-response:${campaignId}:${userId}`,
      kind: 'availability-response',
      eventType: null,
      eventId: campaignId,
      ownerUserId: userId,
      personType: 'officiel',
      personId: userId,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('excludes a candidate who answered unavailable to a campaign covering the event date', async () => {
    const db = dbWithAvailability([
      campaignRecord('availability-request:1', '2026-08-20', '2026-08-25'),
      responseRecord('availability-request:1', 7, { status: 'unavailable', respondedAt: '2026-08-10T00:00:00.000Z' }),
    ]);

    const suggestions = await runWithClubId('afp', () => buildAssignmentSuggestions(db, target, 'arbitre', 5));

    expect(suggestions).toHaveLength(0);
  });

  it('excludes a candidate whose partial availability window does not cover the event time', async () => {
    const db = dbWithAvailability([
      campaignRecord('availability-request:1', '2026-08-20', '2026-08-25'),
      responseRecord('availability-request:1', 7, {
        status: 'partial', availableFrom: '09:00', availableUntil: '12:00', respondedAt: '2026-08-10T00:00:00.000Z',
      }),
    ]);

    const suggestions = await runWithClubId('afp', () => buildAssignmentSuggestions(db, target, 'arbitre', 5));

    expect(suggestions).toHaveLength(0);
  });

  it('keeps a candidate whose partial availability window covers the event time, with an explicit reason', async () => {
    const db = dbWithAvailability([
      campaignRecord('availability-request:1', '2026-08-20', '2026-08-25'),
      responseRecord('availability-request:1', 7, {
        status: 'partial', availableFrom: '13:00', availableUntil: '20:00', respondedAt: '2026-08-10T00:00:00.000Z',
      }),
    ]);

    const suggestions = await runWithClubId('afp', () => buildAssignmentSuggestions(db, target, 'arbitre', 5));

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.reasons).toContain('Disponibilité partielle compatible avec ce créneau');
  });

  it('keeps the current behavior when no campaign covers the event date', async () => {
    const db = dbWithAvailability([
      campaignRecord('availability-request:1', '2020-01-01', '2020-01-02'),
      responseRecord('availability-request:1', 7, { status: 'unavailable', respondedAt: '2020-01-01T00:00:00.000Z' }),
    ]);

    const suggestions = await runWithClubId('afp', () => buildAssignmentSuggestions(db, target, 'arbitre', 5));

    expect(suggestions).toHaveLength(1);
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
