import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';
import { runWithClubId } from '@/lib/auth/club-context';

const mocks = vi.hoisted(() => ({
  eventCoordinatesFromResources: vi.fn(),
  estimateTravelMinutes: vi.fn(),
  listPlanningEventSnapshots: vi.fn(),
}));

vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return { ...actual, listPlanningEventSnapshots: mocks.listPlanningEventSnapshots };
});

vi.mock('./resources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resources')>();
  return { ...actual, eventCoordinatesFromResources: mocks.eventCoordinatesFromResources };
});
vi.mock('./travel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./travel')>();
  return { ...actual, estimateTravelMinutes: mocks.estimateTravelMinutes };
});

const { buildAssignmentSuggestions } = await import('./assignment-suggestions');

function withSettingsSupport(repo: Record<string, unknown>): Record<string, unknown> {
  return {
    findOne: async () => null,
    create: (value: unknown) => value,
    save: async (value: unknown) => value,
    ...repo,
  };
}

const target: PlanningEventSnapshot = {
  eventId: 'target',
  eventType: 'officiel',
  title: 'Match cible',
  date: '23/08/2026',
  time: '18:00',
  durationMinutes: 90,
  location: 'Stade B',
  planningStatus: 'published',
  event: {
    id: 'target',
    type: 'officiel',
    date: '23/08/2026',
    time: '18:00',
    competition: 'Championnat',
    localTeam: 'AFP',
    awayTeam: 'Visiteur',
    venue: 'domicile',
    horaireRendezVous: '17:00',
  },
  extras: { id: 'target', planningStatus: 'published' },
  assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
};

const previous: PlanningEventSnapshot = {
  ...target,
  eventId: 'previous',
  title: 'Match précédent',
  time: '14:00',
  location: 'Stade A',
  event: { ...target.event, id: 'previous', time: '14:00' },
  assignments: {
    arbitre: [{ nom: 'Arbitre Voyageur', numero: '', personId: 7, personType: 'officiel', status: 'accepted' }],
    encadrant: [],
    accompagnateur: [],
  },
};

function fakeDb(maxTravelMinutes: number | null): DataSource {
  const preferencePayload = {
    preferredCategories: [],
    preferredWeekdays: [],
    preferredTimeRanges: [],
    preferredLocations: [],
    maxAssignmentsPerWeek: null,
    maxTravelMinutes,
  };
  return {
    getRepository(name: string) {
      if (name === 'User') {
        return withSettingsSupport({
          find: async () => [{
            id: 7,
            clubId: 'afp',
            nom: 'Arbitre Voyageur',
            telephone: '0600000000',
            indisponibilites: [],
            accessRole: 'dirigeant',
            planningFunctions: ['arbitre_club'],
            active: true,
          }],
        });
      }
      return withSettingsSupport({
        find: async () => [],
        findBy: async () => [],
        findOneBy: async () => null,
      });
    },
    async query(sql: string, params?: unknown[]) {
      if (/^\s*CREATE TABLE/i.test(sql)) return {};
      if (sql.includes('FROM planning_records') && sql.includes('WHERE id = ?')) {
        if (params?.[0] !== 'person-preference:officiel:7') return [];
        return [{
          id: 'person-preference:officiel:7',
          clubId: 'afp',
          kind: 'person-preference',
          eventType: null,
          eventId: null,
          ownerUserId: 7,
          personType: 'officiel',
          personId: 7,
          payload: JSON.stringify(preferencePayload),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
      }
      if (sql.includes('FROM planning_records')) return [];
      return [];
    },
  } as unknown as DataSource;
}

describe('buildAssignmentSuggestions maxTravelMinutes (issue #89)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPlanningEventSnapshots.mockResolvedValue([previous]);
    mocks.eventCoordinatesFromResources.mockImplementation(async (_db, _type, id) =>
      id === 'previous'
        ? { lat: 48.85, lon: 2.30, resourceName: 'Stade A' }
        : { lat: 48.90, lon: 2.40, resourceName: 'Stade B' });
  });

  it('excludes a candidate when the inter-event trip exceeds the configured limit', async () => {
    mocks.estimateTravelMinutes.mockResolvedValue({ status: 'ok', minutes: 55, distanceKm: 35, source: 'osrm' });

    const suggestions = await runWithClubId('afp', () =>
      buildAssignmentSuggestions(fakeDb(45), target, 'arbitre', 5));

    expect(suggestions).toHaveLength(0);
  });

  it('keeps a candidate and explains a compatible trip', async () => {
    mocks.estimateTravelMinutes.mockResolvedValue({ status: 'ok', minutes: 30, distanceKm: 20, source: 'osrm' });

    const suggestions = await runWithClubId('afp', () =>
      buildAssignmentSuggestions(fakeDb(45), target, 'arbitre', 5));

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.reasons.some((reason) => reason.includes('30 min') && reason.includes('45 min'))).toBe(true);
  });

  it('does not exclude when travel estimation is unavailable and adds an explicit reason', async () => {
    mocks.estimateTravelMinutes.mockResolvedValue({ status: 'unavailable', straightLineKm: 20, source: 'unavailable' });

    const suggestions = await runWithClubId('afp', () =>
      buildAssignmentSuggestions(fakeDb(45), target, 'arbitre', 5));

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.reasons.some((reason) => reason.includes('Trajet non estimable'))).toBe(true);
  });

  it('keeps current behavior and avoids travel estimation when preference is null', async () => {
    const suggestions = await runWithClubId('afp', () =>
      buildAssignmentSuggestions(fakeDb(null), target, 'arbitre', 5));

    expect(suggestions).toHaveLength(1);
    expect(mocks.estimateTravelMinutes).not.toHaveBeenCalled();
  });
});
