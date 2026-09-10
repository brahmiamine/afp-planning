import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';
import {
  AssignmentSwapConflictError,
  AssignmentSwapNotFoundError,
  closeStaleAssignmentSwaps,
  isAssignmentSwapOpen,
  nextAssignmentSwapStatus,
  transitionAssignmentSwap,
  type AssignmentSwapPayload,
} from './assignment-swaps';

const mocks = vi.hoisted(() => ({
  listPlanningRecords: vi.fn(),
  getPlanningRecordForUpdate: vi.fn(),
  savePlanningRecordIfStatus: vi.fn(async (..._args: unknown[]) => true),
  listPublishedPlanningEventSnapshots: vi.fn(),
  getPlanningEventSnapshot: vi.fn(),
  readAppSettings: vi.fn(),
  hydratePlanningAssignmentStates: vi.fn(async (_db: unknown, snapshots: PlanningEventSnapshot[]) => snapshots),
}));

// `closeStaleAssignmentSwaps` clôture désormais chaque demande caduque via
// `transitionAssignmentSwap` (verrou + transition conditionnelle, issue #285) plutôt
// que par un `savePlanningRecord` direct : le double mock ci-dessous fait jouer à
// `getPlanningRecordForUpdate` le même rôle que `listPlanningRecords` (relit la demande
// déjà connue par id, comme le ferait un vrai `SELECT ... FOR UPDATE`).
vi.mock('./records', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./records')>();
  return {
    ...actual,
    listPlanningRecords: mocks.listPlanningRecords,
    getPlanningRecordForUpdate: mocks.getPlanningRecordForUpdate,
    savePlanningRecordIfStatus: mocks.savePlanningRecordIfStatus,
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
vi.mock('./assignment-state-overlay', () => ({
  hydratePlanningAssignmentStates: mocks.hydratePlanningAssignmentStates,
}));

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

  it('allows the requester to cancel or the system to expire any open request (issue #285)', () => {
    expect(nextAssignmentSwapStatus('pending-target', 'requester', 'cancel')).toBe('cancelled');
    expect(nextAssignmentSwapStatus('pending-admin', 'requester', 'cancel')).toBe('cancelled');
    expect(nextAssignmentSwapStatus('pending-target', 'system', 'expire')).toBe('cancelled');
    expect(nextAssignmentSwapStatus('pending-admin', 'system', 'expire')).toBe('cancelled');
  });

  it('never allows a cancel/expire on an already-terminal request (issue #285)', () => {
    for (const terminal of ['declined', 'approved', 'rejected', 'cancelled'] as const) {
      expect(nextAssignmentSwapStatus(terminal, 'requester', 'cancel')).toBeNull();
      expect(nextAssignmentSwapStatus(terminal, 'system', 'expire')).toBeNull();
    }
  });

  it('never lets an actor perform a decision that is not explicitly theirs (issue #285)', () => {
    expect(nextAssignmentSwapStatus('pending-target', 'admin', 'cancel')).toBeNull();
    expect(nextAssignmentSwapStatus('pending-admin', 'target', 'approve')).toBeNull();
    expect(nextAssignmentSwapStatus('pending-admin', 'requester', 'approve')).toBeNull();
    expect(nextAssignmentSwapStatus('pending-target', 'system', 'accept')).toBeNull();
  });
});

describe('transitionAssignmentSwap — verrou + transition conditionnelle (issue #285)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applique mutate puis persiste conditionnellement sur le statut lu sous verrou', async () => {
    const record = swapRecord('swap-1');
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    mocks.savePlanningRecordIfStatus.mockResolvedValue(true);
    const mutate = vi.fn(async (_manager: unknown, current: { payload: AssignmentSwapPayload }, nextStatus: string) => ({
      payload: { ...current.payload, status: nextStatus as AssignmentSwapPayload['status'] },
      result: nextStatus,
    }));

    const result = await transitionAssignmentSwap(fakeDb(), 'swap-1', 'target', 'accept', mutate);

    expect(result).toBe('pending-admin');
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mocks.savePlanningRecordIfStatus).toHaveBeenCalledWith(expect.anything(), 'swap-1', 'pending-target', expect.objectContaining({ status: 'pending-admin' }));
  });

  it('échoue avec AssignmentSwapNotFoundError quand la ligne verrouillée est introuvable', async () => {
    mocks.getPlanningRecordForUpdate.mockResolvedValue(null);

    await expect(transitionAssignmentSwap(fakeDb(), 'swap-missing', 'target', 'accept', vi.fn()))
      .rejects.toBeInstanceOf(AssignmentSwapNotFoundError);
  });

  it('échoue avec AssignmentSwapConflictError quand le statut lu sous verrou n’autorise plus la décision (issue #285)', async () => {
    // Simule une décision concurrente déjà appliquée entre la lecture initiale du client
    // et l'obtention du verrou : la demande n'est plus dans l'état attendu.
    const record = swapRecord('swap-1');
    record.payload.status = 'declined';
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    const mutate = vi.fn();

    await expect(transitionAssignmentSwap(fakeDb(), 'swap-1', 'target', 'accept', mutate))
      .rejects.toBeInstanceOf(AssignmentSwapConflictError);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('échoue avec AssignmentSwapConflictError si l’écriture conditionnelle ne trouve plus le statut attendu (issue #285)', async () => {
    // Cas limite : le statut a changé entre la lecture verrouillée et l'écriture (ne
    // devrait pas arriver tant que le verrou est tenu, mais reste un filet de sécurité).
    const record = swapRecord('swap-1');
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    mocks.savePlanningRecordIfStatus.mockResolvedValue(false);
    const mutate = vi.fn(async (_manager: unknown, current: { payload: AssignmentSwapPayload }, nextStatus: string) => ({
      payload: { ...current.payload, status: nextStatus as AssignmentSwapPayload['status'] },
      result: nextStatus,
    }));

    await expect(transitionAssignmentSwap(fakeDb(), 'swap-1', 'target', 'accept', mutate))
      .rejects.toBeInstanceOf(AssignmentSwapConflictError);
  });
});

// `transitionAssignmentSwap` verrouille la ligne via `db.transaction(...)` : ce faux
// `db` rejoue simplement le travail transactionnel avec un manager factice, comme le
// ferait TypeORM (issue #285).
function fakeDb(): DataSource {
  return {
    transaction: async <T>(work: (manager: unknown) => Promise<T>) => work({}),
  } as unknown as DataSource;
}

describe('closeStaleAssignmentSwaps (issue #81)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAppSettings.mockResolvedValue({ timeZone: 'UTC' });
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot()]);
    mocks.savePlanningRecordIfStatus.mockResolvedValue(true);
  });

  it('clôt une demande ouverte dont l’événement a été annulé', async () => {
    const record = swapRecord('swap-1');
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ planningStatus: 'cancelled' })]);

    const closed = await closeStaleAssignmentSwaps(fakeDb());

    expect(closed).toBe(1);
    expect(mocks.savePlanningRecordIfStatus).toHaveBeenCalledTimes(1);
    const [, , expectedStatus, nextPayload] = mocks.savePlanningRecordIfStatus.mock.calls[0] as [unknown, string, string, AssignmentSwapPayload];
    expect(expectedStatus).toBe('pending-target');
    expect(nextPayload.status).toBe('cancelled');
  });

  it('clôt une demande ouverte dont l’événement a déjà commencé', async () => {
    const record = swapRecord('swap-1');
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ date: pastDate })]);

    const closed = await closeStaleAssignmentSwaps(fakeDb());

    expect(closed).toBe(1);
  });

  it('clôt une demande dont l’affectation du demandeur a disparu', async () => {
    const record = swapRecord('swap-1');
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([
      snapshot({ assignments: { arbitre: [], encadrant: [], accompagnateur: [] } }),
    ]);

    const closed = await closeStaleAssignmentSwaps(fakeDb());

    expect(closed).toBe(1);
  });

  it('ne touche pas une demande encore valide', async () => {
    const record = swapRecord('swap-1');
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);

    const closed = await closeStaleAssignmentSwaps(fakeDb());

    expect(closed).toBe(0);
    expect(mocks.savePlanningRecordIfStatus).not.toHaveBeenCalled();
  });

  it('ne touche pas les demandes déjà terminées', async () => {
    const record = swapRecord('swap-1');
    record.payload.status = 'approved';
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.getPlanningRecordForUpdate.mockResolvedValue(record);
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ planningStatus: 'cancelled' })]);

    const closed = await closeStaleAssignmentSwaps(fakeDb());

    expect(closed).toBe(0);
    expect(mocks.savePlanningRecordIfStatus).not.toHaveBeenCalled();
  });

  it('ignore silencieusement une clôture devenue inutile (décision concurrente déjà appliquée, issue #285)', async () => {
    // Le balayage lit `swap-1` comme encore ouvert et caduc, mais entre cette lecture et
    // la tentative de clôture, une décision humaine (admin/cible) l'a déjà fait
    // transitionner : le verrou relit un statut qui n'autorise plus `expire`, et la
    // clôture automatique doit alors s'effacer sans lever d'erreur ni compter la demande.
    const record = swapRecord('swap-1');
    mocks.listPlanningRecords.mockResolvedValue([record]);
    mocks.getPlanningRecordForUpdate.mockResolvedValue({ ...record, payload: { ...record.payload, status: 'approved' } });
    mocks.listPublishedPlanningEventSnapshots.mockResolvedValue([snapshot({ planningStatus: 'cancelled' })]);

    const closed = await closeStaleAssignmentSwaps(fakeDb());

    expect(closed).toBe(0);
    expect(mocks.savePlanningRecordIfStatus).not.toHaveBeenCalled();
  });
});
