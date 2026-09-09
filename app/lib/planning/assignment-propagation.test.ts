import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  isPlanningEventCurrentlyPublished: vi.fn(),
  getPlanningEventSnapshot: vi.fn(),
  savePlanningPublication: vi.fn(),
}));

vi.mock('./event-lifecycle', () => ({
  isPlanningEventCurrentlyPublished: mocks.isPlanningEventCurrentlyPublished,
}));

vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return {
    ...actual,
    getPlanningEventSnapshot: mocks.getPlanningEventSnapshot,
    savePlanningPublication: mocks.savePlanningPublication,
  };
});

import { propagateAssignmentChangesIfPublished } from './assignment-propagation';

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'match-1',
    eventType: 'officiel',
    title: 'AFP – Visiteur',
    date: '23/08/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'published',
    event: {} as never,
    extras: null,
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    ...overrides,
  };
}

const db = {} as DataSource;

describe('propagateAssignmentChangesIfPublished (issue #197)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when there is no diff between before and after', async () => {
    const contacts = [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' as const }];
    const result = await propagateAssignmentChangesIfPublished(db, 'afp', snapshot(), contacts, contacts);

    expect(result).toBe(false);
    expect(mocks.isPlanningEventCurrentlyPublished).not.toHaveBeenCalled();
    expect(mocks.savePlanningPublication).not.toHaveBeenCalled();
  });

  it('does nothing when the event was never published — no immediate propagation, nothing to signal', async () => {
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValueOnce(false);
    const result = await propagateAssignmentChangesIfPublished(
      db, 'afp', snapshot(), [],
      [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' }],
    );

    expect(result).toBe(false);
    expect(mocks.savePlanningPublication).not.toHaveBeenCalled();
  });

  it('marks an already-published event `modified` instead of propagating the change immediately', async () => {
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValueOnce(true);
    mocks.getPlanningEventSnapshot.mockResolvedValueOnce(snapshot({ planningStatus: 'published' }));

    const result = await propagateAssignmentChangesIfPublished(
      db, 'afp', snapshot(), [],
      [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' }],
    );

    expect(result).toBe(true);
    expect(mocks.savePlanningPublication).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ planningStatus: 'published' }),
      expect.objectContaining({ planningStatus: 'modified' }),
    );
  });

  it('does not rewrite the event again if it is already marked modified', async () => {
    mocks.isPlanningEventCurrentlyPublished.mockResolvedValueOnce(true);
    mocks.getPlanningEventSnapshot.mockResolvedValueOnce(snapshot({ planningStatus: 'modified' }));

    const result = await propagateAssignmentChangesIfPublished(
      db, 'afp', snapshot(), [],
      [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel' }],
    );

    expect(result).toBe(true);
    expect(mocks.savePlanningPublication).not.toHaveBeenCalled();
  });
});
