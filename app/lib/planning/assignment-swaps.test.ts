import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';
import {
  closeStaleAssignmentSwaps,
  isAssignmentSwapOpen,
  nextAssignmentSwapStatus,
  type AssignmentSwapPayload,
} from './assignment-swaps';

const mocks = vi.hoisted(() => ({
  listPlanningRecords: vi.fn(),
  savePlanningRecord: vi.fn(),
  listPublishedPlanningEventSnapshots: vi.fn(),
  getPlanningEventSnapshot: vi.fn(),
  readAppSettings: vi.fn(),
}));

vi.mock('./records', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./records')>();
  return {
    ...actual,
    listPlanningRecords: mocks.listPlanningRecords,
    savePlanningRecord: mocks.savePlanningRecord,
  };
});
vi.mock('./published-planning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./published-planning')>();
  return { ...actual, listPublishedPlanningEventSnapshots: mocks.listPublishedPlanningEventSnapshots };
});
vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return { ...actual, getPlanningEventSnapshot: mocks.getPlanningEventSnapshot };
});
vi.mock('@/lib/settings-store', () => ({ readAppSettings: mocks.readAppSettings }));
vi.mock('@/lib/auth/club-context', () => ({ getCurrentClubId: () => 'afp' }));

function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

const futureDate = formatDate(new Date(Date.now() + 10 * 86_400_000));
const pastDate = formatDate(new Date(Date.now() - 10 * 86_400_000));

function swapRecord(id: string): { id: string; kind: string; eventType: string; eventId: string; ownerUserId: number; payload: AssignmentSwapPayload } {
  return {
    id,
    kind: 'assignment-swap',
    eventType: 'amical',
    eventId: 'm-1',
    ownerUserId: 7,
    payload: {
      role: 'encadrant',
      eventType: 'amical',
      eventId: 'm-1',
      eventTitle: 'AFP – Visiteur',
      eventDate: futureDate,
      eventTime: '15:00',
      requester: { userId: 7, personType: 'encadrant', personId: 7, nom: 'Demandeur' },
      target: { userId: 8, personType: 'encadrant', personId: 8, nom: 'Cible' },
      status: 'pending-target',
      message: null,
      createdAt: new Date().toISOString(),
      targetRespondedAt: null,
      adminRespondedAt: null,
      adminUserId: null,
    },
  };
}

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'm-1',
    eventType: 'amical',
    title: 'AFP – Visiteur',
    date: futureDate,
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'published',
    event: {
      id: 'm-1',
      type: 'amical',
      date: futureDate,
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: 'm-1' },
    assignments: {
      arbitre: [],
      encadrant: [{ nom: 'Demandeur', numero: '', personId: 7, personType: 'encadrant', status: 'accepted' }],
      accompagnateur: [],
    },
    ...overrides,
  };
}

describe('assignment swap workflow', () => {
  it('requires target acceptance before admin approval', () => {
    expect(nextAssignmentSwapStatus('pending-target', 'target', 'accept')).toBe('pending-admin');
    expect(nextAssignmentSwapStatus('pending-target', 'admin', 'approve')).toBeNull();
    expect(nextAssignmentSwapStatus('pending-admin', 'admin', 'approve')).toBe('approved');
  });

  it('closes the request on target decline or admin rejection', () => {
    expect(nextAssignmentSwapStatus('pending-target', 'target', 'decline')).toBe('declined');
    expect(nextAssignmentSwapStatus('pending-admin', 'admin', 'reject')).toBe('rejected');
    expect(isAssignmentSwapOpen('declined')).toBe(false);
    expect(isAssignmentSwapOpen('pending-admin')).toBe(true);
  });
});

describe('closeStaleAssignmentSwaps (issue #81)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAppSettings.mockResolvedValue({ timeZone: 'UTC' });
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot()]);
  });

  it('clôt une demande ouverte dont l’événement a été annulé', async () => {
    mocks.listPlanningRecords.mockResolvedValue([swapRecord('swap-1')]);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ planningStatus: 'cancelled' })]);

    const closed = await closeStaleAssignmentSwaps({} as DataSource);

    expect(closed).toBe(1);
    expect(mocks.savePlanningRecord).toHaveBeenCalledTimes(1);
    expect(mocks.savePlanningRecord.mock.calls[0]?.[1].payload.status).toBe('cancelled');
  });

  it('clôt une demande ouverte dont l’événement a déjà commencé', async () => {
    mocks.listPlanningRecords.mockResolvedValue([swapRecord('swap-1')]);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ date: pastDate })]);

    const closed = await closeStaleAssignmentSwaps({} as DataSource);

    expect(closed).toBe(1);
  });

  it('clôt une demande dont l’affectation du demandeur a disparu', async () => {
    mocks.listPlanningRecords.mockResolvedValue([swapRecord('swap-1')]);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([
      snapshot({ assignments: { arbitre: [], encadrant: [], accompagnateur: [] } }),
    ]);

    const closed = await closeStaleAssignmentSwaps({} as DataSource);

    expect(closed).toBe(1);
  });

  it('ne touche pas une demande encore valide', async () => {
    mocks.listPlanningRecords.mockResolvedValue([swapRecord('swap-1')]);

    const closed = await closeStaleAssignmentSwaps({} as DataSource);

    expect(closed).toBe(0);
    expect(mocks.savePlanningRecord).not.toHaveBeenCalled();
  });

  it('ne touche pas les demandes déjà terminées', async () => {
    const record = swapRecord('swap-1');
    record.payload.status = 'approved';
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ planningStatus: 'cancelled' })]);

    const closed = await closeStaleAssignmentSwaps({} as DataSource);

    expect(closed).toBe(0);
    expect(mocks.savePlanningRecord).not.toHaveBeenCalled();
  });
});
