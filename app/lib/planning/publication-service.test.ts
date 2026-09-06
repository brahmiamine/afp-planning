import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { runWithClubId } from '@/lib/auth/club-context';
import type { PlanningEventSnapshot } from './event-store';

const mocks = vi.hoisted(() => ({
  savePlanningPublication: vi.fn(),
  logAuditEntry: vi.fn(),
  getPublishedPlanningEventSnapshot: vi.fn(),
  patchPublishedPlanningEvent: vi.fn(),
  notifyContact: vi.fn(),
}));

vi.mock('./event-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./event-store')>();
  return { ...actual, savePlanningPublication: mocks.savePlanningPublication };
});
vi.mock('@/lib/db/audit-log', () => ({ logAuditEntry: mocks.logAuditEntry }));
vi.mock('@/lib/notifications/service', () => ({ notifyContact: mocks.notifyContact }));
vi.mock('./published-planning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./published-planning')>();
  return {
    ...actual,
    getPublishedPlanningEventSnapshot: mocks.getPublishedPlanningEventSnapshot,
    patchPublishedPlanningEvent: mocks.patchPublishedPlanningEvent,
  };
});

import { applyPlanningPublicationAction } from './publication-service';

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

const db = {} as DataSource;
const user = { id: 1, clubId: 'afp', roles: ['admin'] } as unknown as SessionUser;

describe('applyPlanningPublicationAction — réouverture (issue #71)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublishedPlanningEventSnapshot.mockResolvedValue(null);
  });

  it('reopen d’un événement jamais publié reste un changement de brouillon silencieux', async () => {
    const result = await runWithClubId(user.clubId, () =>
      applyPlanningPublicationAction(db, user, snapshot(), 'reopen'));

    expect(result).toBe('draft');
    expect(mocks.savePlanningPublication).toHaveBeenCalledTimes(1);
    expect(mocks.savePlanningPublication.mock.calls[0]?.[2]).toMatchObject({
      planningStatus: 'draft',
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    });
    expect(mocks.patchPublishedPlanningEvent).not.toHaveBeenCalled();
    expect(mocks.notifyContact).not.toHaveBeenCalled();
  });

  it('reopen d’un événement publié puis annulé redevient visible et notifie les personnes affectées', async () => {
    const published = snapshot({ planningStatus: 'cancelled' });
    mocks.getPublishedPlanningEventSnapshot.mockResolvedValue(published);

    const result = await runWithClubId(user.clubId, () =>
      applyPlanningPublicationAction(db, user, snapshot(), 'reopen'));

    expect(result).toBe('modified');
    expect(mocks.savePlanningPublication.mock.calls[0]?.[2]).toMatchObject({ planningStatus: 'modified' });
    expect(mocks.patchPublishedPlanningEvent).toHaveBeenCalledTimes(1);
    expect(mocks.patchPublishedPlanningEvent.mock.calls[0]?.[1]).toBe(user.clubId);
    expect(mocks.patchPublishedPlanningEvent.mock.calls[0]?.[2]).toMatchObject({ planningStatus: 'modified' });
    // Le contact ayant refusé n'est pas relancé, seul le contact 'pending' est notifié.
    expect(mocks.notifyContact).toHaveBeenCalledTimes(1);
    expect(mocks.notifyContact.mock.calls[0]?.[1]).toMatchObject({ personId: 7 });
  });

  it('cancel reste silencieux (la notification a lieu à la publication globale)', async () => {
    const result = await applyPlanningPublicationAction(db, user, snapshot(), 'cancel', 'Intempéries');

    expect(result).toBe('cancelled');
    expect(mocks.savePlanningPublication.mock.calls[0]?.[2]).toMatchObject({
      planningStatus: 'cancelled',
      cancellationReason: 'Intempéries',
    });
    expect(mocks.patchPublishedPlanningEvent).not.toHaveBeenCalled();
    expect(mocks.notifyContact).not.toHaveBeenCalled();
  });
});
