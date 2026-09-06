import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  readAppSettings: vi.fn(),
  listPlanningEventSnapshots: vi.fn(),
  savePlanningPublication: vi.fn(),
  getPublishedPlanning: vi.fn(),
  savePublishedPlanning: vi.fn(),
  planningPublicationDiff: vi.fn(),
  computePerUserPublicationChanges: vi.fn(),
  logAuditEntry: vi.fn(),
  notifyContact: vi.fn(),
}));

vi.mock('@/lib/settings-store', () => ({ readAppSettings: mocks.readAppSettings }));
vi.mock('@/lib/db/audit-log', () => ({ logAuditEntry: mocks.logAuditEntry }));
vi.mock('@/lib/notifications/service', () => ({ notifyContact: mocks.notifyContact }));
vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return {
    ...actual,
    listPlanningEventSnapshots: mocks.listPlanningEventSnapshots,
    savePlanningPublication: mocks.savePlanningPublication,
  };
});
vi.mock('./published-planning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./published-planning')>();
  return {
    ...actual,
    getPublishedPlanning: mocks.getPublishedPlanning,
    savePublishedPlanning: mocks.savePublishedPlanning,
    planningPublicationDiff: mocks.planningPublicationDiff,
    computePerUserPublicationChanges: mocks.computePerUserPublicationChanges,
  };
});

import { publishGlobalPlanning } from './global-publication';

function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

const futureDate = formatDate(new Date(Date.now() + 30 * 86_400_000));
const pastDate = formatDate(new Date(Date.now() - 30 * 86_400_000));

function matchSnapshot(id: string, date = futureDate): PlanningEventSnapshot {
  return {
    eventId: id,
    eventType: 'amical',
    title: `AFP – ${id}`,
    date,
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'draft',
    event: {
      id,
      type: 'amical',
      date,
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: id,
      venue: 'domicile',
      planningRevision: 0,
    },
    extras: { id, planningRevision: 0 },
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    revision: 0,
  };
}

interface TxState {
  publishedEvents: string[];
  snapshotSaved: boolean;
}

function fakeDb(state: TxState): DataSource {
  return {
    getRepository: () => ({ find: async () => [] }),
    transaction: async <T>(work: (manager: unknown) => Promise<T>) => {
      const local = structuredClone(state);
      const manager = { txState: local };
      const result = await work(manager);
      state.publishedEvents = local.publishedEvents;
      state.snapshotSaved = local.snapshotSaved;
      return result;
    },
  } as unknown as DataSource;
}

const user = {
  id: 7,
  clubId: 'afp',
  roles: ['admin'],
} as unknown as SessionUser;

const diff = {
  current: 2,
  published: 0,
  added: 2,
  modified: 0,
  removed: 0,
  unchanged: 0,
  changed: 2,
  removedEvents: [],
};

const openFeatures = {
  features: {
    adminPublicationApproval: false,
    publicationReadiness: false,
    assignmentValidation: false,
    requireArbitreForPublication: false,
    requireEncadrantForPublication: false,
    requireAccompagnateurForPublication: false,
  },
};

function mockSuccessfulSave(snapshots: PlanningEventSnapshot[]) {
  mocks.savePlanningPublication.mockImplementation(async (manager: { txState: TxState }, snapshot: PlanningEventSnapshot) => {
    manager.txState.publishedEvents.push(snapshot.eventId);
  });
  mocks.savePublishedPlanning.mockImplementation(async (manager: { txState: TxState }, _user: SessionUser, refreshed: PlanningEventSnapshot[], publishedAt: string) => {
    manager.txState.snapshotSaved = true;
    return {
      schemaVersion: 1,
      publishedAt,
      publishedByUserId: user.id,
      events: refreshed,
    };
  });
}

describe('publication globale — atomicité (issue #37)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAppSettings.mockResolvedValue(openFeatures);
    mocks.getPublishedPlanning.mockResolvedValue(null);
    mocks.planningPublicationDiff.mockReturnValue(diff);
    mocks.computePerUserPublicationChanges.mockReturnValue([]);
  });

  it('rollbacke les statuts déjà écrits si un événement échoue avant le snapshot global', async () => {
    const snapshots = [matchSnapshot('a-1'), matchSnapshot('a-2')];
    const state: TxState = { publishedEvents: [], snapshotSaved: false };
    const db = fakeDb(state);

    mocks.listPlanningEventSnapshots.mockResolvedValue(snapshots);
    mocks.savePlanningPublication.mockImplementation(async (manager: { txState: TxState }, snapshot: PlanningEventSnapshot) => {
      manager.txState.publishedEvents.push(snapshot.eventId);
      if (snapshot.eventId === 'a-2') throw new Error('conflit simulé');
    });
    mocks.savePublishedPlanning.mockImplementation(async (manager: { txState: TxState }) => {
      manager.txState.snapshotSaved = true;
      return {
        schemaVersion: 1,
        publishedAt: '2026-09-06T00:00:00.000Z',
        publishedByUserId: user.id,
        events: snapshots,
      };
    });

    await expect(publishGlobalPlanning(db, user)).rejects.toThrow('conflit simulé');

    expect(state).toEqual({ publishedEvents: [], snapshotSaved: false });
    expect(mocks.savePublishedPlanning).not.toHaveBeenCalled();
    expect(mocks.logAuditEntry).not.toHaveBeenCalled();
  });

  it('écrit tous les statuts et le snapshot avec le même manager transactionnel', async () => {
    const snapshots = [matchSnapshot('a-1'), matchSnapshot('a-2')];
    const state: TxState = { publishedEvents: [], snapshotSaved: false };
    const db = fakeDb(state);

    mocks.listPlanningEventSnapshots.mockResolvedValue(snapshots);
    mockSuccessfulSave(snapshots);

    await publishGlobalPlanning(db, user);

    expect(state).toEqual({ publishedEvents: ['a-1', 'a-2'], snapshotSaved: true });
    const firstManager = mocks.savePlanningPublication.mock.calls[0]?.[0];
    expect(mocks.savePlanningPublication.mock.calls[1]?.[0]).toBe(firstManager);
    expect(mocks.savePublishedPlanning.mock.calls[0]?.[0]).toBe(firstManager);
  });
});

describe('publication globale — événements sortis de la fenêtre (issue #76)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAppSettings.mockResolvedValue(openFeatures);
    mocks.planningPublicationDiff.mockReturnValue(diff);
    mocks.computePerUserPublicationChanges.mockReturnValue([]);
  });

  it('exclut du diff de notification les événements passés partis en historique', async () => {
    const stillInWindow = { ...matchSnapshot('b-1'), planningStatus: 'published' as const };
    // Événement publié il y a 30 jours : hors fenêtre J-7, il part en historique.
    const agedOut = {
      ...matchSnapshot('old-1', pastDate),
      planningStatus: 'published' as const,
    };
    const snapshots = [matchSnapshot('b-1')];
    const state: TxState = { publishedEvents: [], snapshotSaved: false };
    const db = fakeDb(state);

    mocks.listPlanningEventSnapshots.mockResolvedValue(snapshots);
    mocks.getPublishedPlanning.mockResolvedValue({
      schemaVersion: 1,
      publishedAt: '2026-09-01T00:00:00.000Z',
      publishedByUserId: user.id,
      events: [agedOut, stillInWindow],
    });
    mockSuccessfulSave(snapshots);

    await publishGlobalPlanning(db, user);

    expect(mocks.computePerUserPublicationChanges).toHaveBeenCalledTimes(1);
    const [previousArg] = mocks.computePerUserPublicationChanges.mock.calls[0] as [PlanningEventSnapshot[]];
    expect(previousArg.map((snapshot) => snapshot.eventId)).toEqual(['b-1']);
  });
});
