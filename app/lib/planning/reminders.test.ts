import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';

const notifyContact = vi.fn(async (..._args: unknown[]) => undefined);
const saveRoleAssignments = vi.fn(async (..._args: unknown[]) => 1);
const liveByKey = new Map<string, PlanningEventSnapshot>();
let liveSnapshots: PlanningEventSnapshot[] = [];
let publishedSnapshots: PlanningEventSnapshot[] | null = null;

vi.mock('@/lib/notifications/service', () => ({
  notifyContact: (...args: unknown[]) => notifyContact(...args),
}));
vi.mock('@/lib/settings-store', () => ({
  readAppSettings: vi.fn(async () => ({ timeZone: 'UTC' })),
}));
vi.mock('@/lib/auth/club-context', () => ({
  getCurrentClubId: () => 'afp',
}));
vi.mock('./event-store', () => ({
  listPlanningEventSnapshots: vi.fn(async () => liveSnapshots),
  getPlanningEventSnapshot: vi.fn(async (_db: unknown, eventType: string, eventId: string) =>
    liveByKey.get(`${eventType}:${eventId}`) ?? null),
  saveRoleAssignments: (...args: unknown[]) => saveRoleAssignments(...args),
}));
vi.mock('./published-planning', async (importOriginal) => {
  const original = await importOriginal<typeof import('./published-planning')>();
  return {
    ...original,
    listPublishedPlanningEventSnapshots: vi.fn(async () => publishedSnapshots),
  };
});

import { runDuePlanningReminders } from './reminders';

function snapshot(overrides: Partial<PlanningEventSnapshot> = {}): PlanningEventSnapshot {
  return {
    eventId: 'm-1',
    eventType: 'officiel',
    title: 'AFP – Visiteur',
    date: '23/08/2099',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'published',
    event: {
      id: 'm-1',
      type: 'officiel',
      date: '23/08/2099',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Championnat',
      categorie: 'U15',
      localTeam: 'AFP',
      awayTeam: 'Visiteur',
      venue: 'domicile',
    },
    extras: { id: 'm-1' },
    assignments: {
      arbitre: [{
        nom: 'Arbitre',
        numero: '',
        personId: 7,
        personType: 'officiel',
        status: 'pending',
        remindersSent: [],
        assignedAt: new Date(Date.now() - 72 * 3_600_000).toISOString(),
      }],
      encadrant: [],
      accompagnateur: [],
    },
    ...overrides,
  };
}

describe('runDuePlanningReminders (issue #70)', () => {
  it('never sends a reminder for a cancelled event kept in the published snapshot', async () => {
    const cancelled = snapshot({ planningStatus: 'cancelled' });
    liveSnapshots = [cancelled];
    publishedSnapshots = [cancelled];
    liveByKey.clear();
    liveByKey.set('officiel:m-1', cancelled);
    notifyContact.mockClear();

    const result = await runDuePlanningReminders({} as DataSource, Date.now());

    expect(notifyContact).not.toHaveBeenCalled();
    expect(result.remindersSent).toBe(0);
  });

  it('does not send reminders from live data before the first global publication (issue #94)', async () => {
    const live = snapshot();
    liveSnapshots = [live];
    publishedSnapshots = null;
    liveByKey.clear();
    liveByKey.set('officiel:m-1', live);
    notifyContact.mockClear();
    saveRoleAssignments.mockClear();

    const result = await runDuePlanningReminders({} as DataSource, Date.now());

    expect(result.inspectedEvents).toBe(0);
    expect(result.remindersSent).toBe(0);
    expect(notifyContact).not.toHaveBeenCalled();
  });

  it('sends a reminder for a pending contact on a visible published event', async () => {
    const published = snapshot();
    liveSnapshots = [published];
    publishedSnapshots = [published];
    liveByKey.clear();
    liveByKey.set('officiel:m-1', published);
    notifyContact.mockClear();
    saveRoleAssignments.mockClear();

    const result = await runDuePlanningReminders({} as DataSource, Date.now());

    expect(notifyContact).toHaveBeenCalledTimes(1);
    expect(result.remindersSent).toBe(1);
    expect(saveRoleAssignments).toHaveBeenCalledTimes(1);
  });
});
