import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  savePlanningPublication: vi.fn(),
  logAuditEntry: vi.fn(),
}));

vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return { ...actual, savePlanningPublication: mocks.savePlanningPublication };
});
vi.mock('@/lib/db/audit-log', () => ({ logAuditEntry: mocks.logAuditEntry }));

import { applyPlanningPublicationAction } from './publication-service';

// `applyPlanningPublicationAction` enveloppe statut + audit dans `db.transaction`.
function fakeDb(): DataSource {
  return {
    transaction: async <T>(work: (manager: unknown) => Promise<T>) => work({}),
  } as unknown as DataSource;
}

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'm-1',
    eventType: 'amical',
    title: 'AFP – Visiteur',
    date: '23/08/2099',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'cancelled',
    event: {
      id: 'm-1',
      type: 'amical',
      date: '23/08/2099',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: 'm-1' },
    assignments: {
      arbitre: [
        { nom: 'Arbitre', numero: '', personId: 7, personType: 'officiel', status: 'pending', remindersSent: [] },
        { nom: 'Refusé', numero: '', personId: 8, personType: 'officiel', status: 'declined', remindersSent: [] },
      ],
      encadrant: [],
      accompagnateur: [],
    },
    ...overrides,
  };
}

const user = { id: 1, clubId: 'afp', accessRole: 'admin', planningFunctions: [] } as unknown as SessionUser;

describe('applyPlanningPublicationAction — réouverture (issue #71)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reopen reste un changement de brouillon jusqu’à la publication globale', async () => {
    const result = await applyPlanningPublicationAction(fakeDb(), user, snapshot(), 'reopen');

    expect(result).toBe('draft');
    expect(mocks.savePlanningPublication).toHaveBeenCalledTimes(1);
    expect(mocks.savePlanningPublication.mock.calls[0]?.[2]).toMatchObject({
      planningStatus: 'draft',
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    });
  });

  it('cancel reste silencieux (la notification a lieu à la publication globale)', async () => {
    const result = await applyPlanningPublicationAction(fakeDb(), user, snapshot(), 'cancel', 'Intempéries');

    expect(result).toBe('cancelled');
    expect(mocks.savePlanningPublication.mock.calls[0]?.[2]).toMatchObject({
      planningStatus: 'cancelled',
      cancellationReason: 'Intempéries',
    });
  });

  it('exécute sauvegarde et audit dans la même transaction (issue #275)', async () => {
    const manager = { kind: 'tx-manager' };
    const db = {
      transaction: async <T>(work: (m: unknown) => Promise<T>) => work(manager),
    } as unknown as DataSource;

    await applyPlanningPublicationAction(db, user, snapshot(), 'reopen');

    expect(mocks.savePlanningPublication.mock.calls[0]?.[0]).toBe(manager);
    expect(mocks.logAuditEntry.mock.calls[0]?.[0]).toBe(manager);
  });
});
