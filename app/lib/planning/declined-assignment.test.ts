import { describe, expect, it, vi, afterEach } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  getPlanningEventSnapshot: vi.fn(),
  saveRoleAssignments: vi.fn(),
  savePlanningPublication: vi.fn(),
  isPlanningEventCurrentlyPublished: vi.fn(),
  listPublishedPlanningEventSnapshots: vi.fn(),
  hydratePlanningAssignmentStates: vi.fn(),
  propagateAssignmentChangesIfPublished: vi.fn(),
}));

vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return {
    ...actual,
    getPlanningEventSnapshot: mocks.getPlanningEventSnapshot,
    saveRoleAssignments: mocks.saveRoleAssignments,
    savePlanningPublication: mocks.savePlanningPublication,
  };
});

vi.mock('./event-lifecycle', () => ({
  isPlanningEventCurrentlyPublished: mocks.isPlanningEventCurrentlyPublished,
}));

vi.mock('./published-planning', () => ({
  listPublishedPlanningEventSnapshots: mocks.listPublishedPlanningEventSnapshots,
}));

vi.mock('./assignment-state-overlay', () => ({
  hydratePlanningAssignmentStates: mocks.hydratePlanningAssignmentStates,
}));

vi.mock('./assignment-propagation', () => ({
  propagateAssignmentChangesIfPublished: mocks.propagateAssignmentChangesIfPublished,
}));

import {
  contactMatchesDeclinedPerson,
  filterActiveAssignments,
  hasDeclinedAssignment,
  resolveDisplayedPlanningStatus,
} from './declined-assignment';
import { vacateDeclinedAssignmentFromWorkingDraft } from './declined-assignment-draft';

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'match-1',
    eventType: 'officiel',
    title: 'Salesienne – Minhotos',
    date: '13/09/2026',
    time: '09:00',
    durationMinutes: 90,
    location: 'Paris',
    planningStatus: 'published',
    event: {} as never,
    extras: null,
    assignments: {
      arbitre: [{ nom: 'samire', numero: '', personId: 12, personType: 'officiel' }],
      encadrant: [],
      accompagnateur: [],
    },
    ...overrides,
  };
}

const db = {} as DataSource;

describe('declined assignment helpers', () => {
  it('matches a declined person by stable id first, then by name', () => {
    expect(contactMatchesDeclinedPerson(
      { nom: 'Samire', personId: 12, personType: 'officiel' },
      { id: 12, nom: 'Autre' },
    )).toBe(true);
    expect(contactMatchesDeclinedPerson(
      { nom: 'samire' },
      { nom: 'Samire' },
    )).toBe(true);
    expect(contactMatchesDeclinedPerson(
      { nom: 'samire', personId: 12, personType: 'officiel' },
      { id: 99, nom: 'samire' },
    )).toBe(false);
  });

  it('hides declined contacts from the card assignment lists', () => {
    const contacts = [
      { nom: 'samire', personId: 12, status: 'pending' as const },
      { nom: 'karim', personId: 8 },
    ];
    expect(filterActiveAssignments(contacts, 'arbitre', [
      { nom: 'samire', role: 'arbitre', personId: 12 },
    ])).toEqual([{ nom: 'karim', personId: 8 }]);
    expect(filterActiveAssignments(
      [{ nom: 'samire', status: 'declined' as const }],
      'arbitre',
    )).toEqual([]);
  });

  it('blocks re-assigning an official who already declined the same role', () => {
    const declined = [{ nom: 'samire', role: 'arbitre' as const, personId: 12 }];
    expect(hasDeclinedAssignment({ nom: 'samire', personId: 12 }, 'arbitre', declined)).toBe(true);
    expect(hasDeclinedAssignment({ nom: 'samire', personId: 12 }, 'encadrant', declined)).toBe(false);
    expect(hasDeclinedAssignment({ nom: 'karim', personId: 8 }, 'arbitre', declined)).toBe(false);
  });

  it('prefers modified / cancelled over a stale published extras status', () => {
    expect(resolveDisplayedPlanningStatus('published', 'modified')).toBe('modified');
    expect(resolveDisplayedPlanningStatus('published', 'cancelled')).toBe('cancelled');
    expect(resolveDisplayedPlanningStatus('published', undefined)).toBe('published');
  });
});

describe('vacateDeclinedAssignmentFromWorkingDraft', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('removes the declined official from the live draft and marks the event modified', async () => {
    mocks.getPlanningEventSnapshot.mockResolvedValueOnce(snapshot());
    mocks.saveRoleAssignments.mockResolvedValueOnce(1);
    mocks.propagateAssignmentChangesIfPublished.mockResolvedValueOnce(true);

    const removed = await vacateDeclinedAssignmentFromWorkingDraft(
      db,
      'sp',
      'officiel',
      'match-1',
      'arbitre',
      { id: 12, nom: 'samire' },
    );

    expect(removed).toBe(true);
    expect(mocks.saveRoleAssignments).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ eventId: 'match-1' }),
      'arbitre',
      [],
    );
    expect(mocks.propagateAssignmentChangesIfPublished).toHaveBeenCalledWith(
      db,
      'sp',
      expect.objectContaining({ eventId: 'match-1' }),
      [{ nom: 'samire', numero: '', personId: 12, personType: 'officiel' }],
      [],
    );
  });

  it('keeps other officials on the same role', async () => {
    mocks.getPlanningEventSnapshot.mockResolvedValueOnce(snapshot({
      assignments: {
        arbitre: [
          { nom: 'samire', numero: '', personId: 12, personType: 'officiel' },
          { nom: 'karim', numero: '', personId: 8, personType: 'officiel' },
        ],
        encadrant: [],
        accompagnateur: [],
      },
    }));
    mocks.saveRoleAssignments.mockResolvedValueOnce(1);
    mocks.propagateAssignmentChangesIfPublished.mockResolvedValueOnce(true);

    await vacateDeclinedAssignmentFromWorkingDraft(
      db, 'sp', 'officiel', 'match-1', 'arbitre', { id: 12, nom: 'samire' },
    );

    expect(mocks.saveRoleAssignments).toHaveBeenCalledWith(
      db,
      expect.anything(),
      'arbitre',
      [{ nom: 'karim', numero: '', personId: 8, personType: 'officiel' }],
    );
  });
});
