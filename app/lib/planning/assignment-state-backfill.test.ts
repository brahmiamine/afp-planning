import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  getPlanningRecord: vi.fn(),
  savePlanningRecord: vi.fn(),
  listPlanningEventSnapshots: vi.fn(),
  getPublishedPlanning: vi.fn(),
  getPublishedPlanningHistory: vi.fn(),
  backfill: vi.fn(),
}));

vi.mock('./records', () => ({
  getPlanningRecord: mocks.getPlanningRecord,
  savePlanningRecord: mocks.savePlanningRecord,
}));
vi.mock('./event-store', () => ({
  listPlanningEventSnapshots: mocks.listPlanningEventSnapshots,
}));
vi.mock('./published-planning', () => ({
  getPublishedPlanning: mocks.getPublishedPlanning,
  getPublishedPlanningHistory: mocks.getPublishedPlanningHistory,
}));
vi.mock('./assignment-state-store', () => ({
  backfillAssignmentStatesFromSnapshots: mocks.backfill,
}));

import { ensureAssignmentStateBackfilled } from './assignment-state-backfill';

const db = {} as DataSource;

function fakeSnapshot(eventId: string): PlanningEventSnapshot {
  return { eventId, eventType: 'amical' } as PlanningEventSnapshot;
}

describe('ensureAssignmentStateBackfilled (issue #41, étape 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPlanningEventSnapshots.mockResolvedValue([fakeSnapshot('live-1')]);
    mocks.getPublishedPlanning.mockResolvedValue({ schemaVersion: 1, events: [fakeSnapshot('pub-1')] });
    mocks.getPublishedPlanningHistory.mockResolvedValue({ schemaVersion: 1, events: [fakeSnapshot('hist-1')] });
    mocks.backfill.mockResolvedValue(3);
  });

  it('exécute le rétro-remplissage une fois, live d’abord, puis pose le marqueur', async () => {
    mocks.getPlanningRecord.mockResolvedValue(null);

    await ensureAssignmentStateBackfilled(db, 'afp');

    expect(mocks.backfill).toHaveBeenCalledTimes(1);
    const [, sources, clubId] = mocks.backfill.mock.calls[0]!;
    expect((sources as PlanningEventSnapshot[]).map((s) => s.eventId)).toEqual(['live-1', 'pub-1', 'hist-1']);
    expect(clubId).toBe('afp');
    expect(mocks.savePlanningRecord).toHaveBeenCalledTimes(1);
    expect(mocks.savePlanningRecord.mock.calls[0]?.[1]).toMatchObject({
      id: 'assignment-state-backfill:afp',
      kind: 'assignment-state-backfill',
      clubId: 'afp',
    });
  });

  it('ne refait rien si le marqueur existe déjà', async () => {
    mocks.getPlanningRecord.mockResolvedValue({ id: 'assignment-state-backfill:afp' });

    await ensureAssignmentStateBackfilled(db, 'afp');

    expect(mocks.listPlanningEventSnapshots).not.toHaveBeenCalled();
    expect(mocks.backfill).not.toHaveBeenCalled();
    expect(mocks.savePlanningRecord).not.toHaveBeenCalled();
  });

  it('supporte un club sans planning publié ni historique', async () => {
    mocks.getPlanningRecord.mockResolvedValue(null);
    mocks.getPublishedPlanning.mockResolvedValue(null);
    mocks.getPublishedPlanningHistory.mockResolvedValue(null);

    await ensureAssignmentStateBackfilled(db, 'afp');

    const [, sources] = mocks.backfill.mock.calls[0]!;
    expect((sources as PlanningEventSnapshot[]).map((s) => s.eventId)).toEqual(['live-1']);
  });

  it('ne pose pas le marqueur si le backfill échoue (reprise à la prochaine exécution)', async () => {
    mocks.getPlanningRecord.mockResolvedValue(null);
    mocks.backfill.mockRejectedValue(new Error('boom'));

    await expect(ensureAssignmentStateBackfilled(db, 'afp')).rejects.toThrow('boom');
    expect(mocks.savePlanningRecord).not.toHaveBeenCalled();
  });
});
