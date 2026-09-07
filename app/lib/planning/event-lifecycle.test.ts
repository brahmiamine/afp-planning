import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  removePublishedPlanningEvent: vi.fn(),
  appendPublishedPlanningHistory: vi.fn(),
  notifyContact: vi.fn(),
  readAppSettings: vi.fn(),
  hydratePlanningAssignmentStates: vi.fn(async (_db: unknown, snapshots: PlanningEventSnapshot[]) => snapshots),
}));

vi.mock('./published-planning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./published-planning')>();
  return {
    ...actual,
    removePublishedPlanningEvent: mocks.removePublishedPlanningEvent,
    appendPublishedPlanningHistory: mocks.appendPublishedPlanningHistory,
  };
});
vi.mock('@/lib/notifications/service', () => ({ notifyContact: mocks.notifyContact }));
vi.mock('@/lib/settings-store', () => ({ readAppSettings: mocks.readAppSettings }));
vi.mock('./assignment-state-overlay', () => ({
  hydratePlanningAssignmentStates: mocks.hydratePlanningAssignmentStates,
}));

import { archivePlanningEvent } from './event-lifecycle';

function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

const futureDate = formatDate(new Date(Date.now() + 10 * 86_400_000));
const pastDate = formatDate(new Date(Date.now() - 10 * 86_400_000));

function publishedSnapshot(date = futureDate): PlanningEventSnapshot {
  return {
    eventId: 'm-1',
    eventType: 'amical',
    title: 'AFP – Visiteur',
    date,
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'published',
    event: {
      id: 'm-1',
      type: 'amical',
      date,
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: 'm-1' },
    assignments: {
      arbitre: [{ nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel', status: 'pending', remindersSent: [] }],
      encadrant: [],
      accompagnateur: [],
    },
  };
}

function fakeDb(): DataSource {
  const query = async () => [];
  return {
    query,
    transaction: async <T>(work: (manager: unknown) => Promise<T>) => work({ query }),
  } as unknown as DataSource;
}

describe('archivePlanningEvent — synchronisation du snapshot publié (issue #73)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAppSettings.mockResolvedValue({ timeZone: 'UTC' });
  });

  it('retire l\'événement du snapshot publié, le verse en historique et notifie les affectés', async () => {
    const removed = publishedSnapshot();
    mocks.removePublishedPlanningEvent.mockResolvedValue(removed);

    await archivePlanningEvent(fakeDb(), 'amical', 'm-1', 42, 'afp');

    expect(mocks.removePublishedPlanningEvent).toHaveBeenCalledTimes(1);
    expect(mocks.appendPublishedPlanningHistory).toHaveBeenCalledTimes(1);
    expect(mocks.appendPublishedPlanningHistory.mock.calls[0]?.[2]).toEqual([removed]);
    expect(mocks.notifyContact).toHaveBeenCalledTimes(1);
    expect(mocks.notifyContact.mock.calls[0]?.[2]).toMatchObject({
      type: 'planning-published-removed',
      title: 'Affectation supprimée',
      eventType: 'amical',
      eventId: 'm-1',
    });
  });

  it('ne fait rien de plus si l\'événement n\'était pas dans le snapshot publié', async () => {
    mocks.removePublishedPlanningEvent.mockResolvedValue(null);

    await archivePlanningEvent(fakeDb(), 'amical', 'm-1', 42, 'afp');

    expect(mocks.appendPublishedPlanningHistory).not.toHaveBeenCalled();
    expect(mocks.notifyContact).not.toHaveBeenCalled();
  });

  it('verse en historique sans notifier quand l\'événement archivé est déjà passé', async () => {
    mocks.removePublishedPlanningEvent.mockResolvedValue(publishedSnapshot(pastDate));

    await archivePlanningEvent(fakeDb(), 'amical', 'm-1', 42, 'afp');

    expect(mocks.appendPublishedPlanningHistory).toHaveBeenCalledTimes(1);
    expect(mocks.notifyContact).not.toHaveBeenCalled();
  });
});
