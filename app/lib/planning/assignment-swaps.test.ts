import { describe, expect, it } from 'vitest';
import {
  isAssignmentSwapOpen,
  nextAssignmentSwapStatus,
  shouldExpireAssignmentSwap,
  type AssignmentSwapPayload,
} from './assignment-swaps';
import type { PlanningEventSnapshot } from './event-store';

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

const payload: AssignmentSwapPayload = {
  role: 'encadrant',
  eventType: 'entrainement',
  eventId: 'e-1',
  eventTitle: 'Entraînement',
  eventDate: '10/09/2026',
  eventTime: '18:00',
  requester: { userId: 7, personType: 'encadrant', personId: 7, nom: 'Jean' },
  target: { userId: 8, personType: 'encadrant', personId: 8, nom: 'Paul' },
  status: 'pending-target',
  message: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  targetRespondedAt: null,
  adminRespondedAt: null,
  adminUserId: null,
};

function snapshot(status: PlanningEventSnapshot['planningStatus'] = 'published'): PlanningEventSnapshot {
  return {
    eventId: 'e-1',
    eventType: 'entrainement',
    title: 'Entraînement',
    date: '10/09/2026',
    time: '18:00',
    durationMinutes: 90,
    location: null,
    planningStatus: status,
    event: { id: 'e-1', type: 'entrainement', date: '10/09/2026', time: '18:00' },
    extras: null,
    assignments: {
      arbitre: [],
      encadrant: [{ nom: 'Jean', numero: '', personType: 'encadrant', personId: 7, status: 'accepted' }],
      accompagnateur: [],
    },
  } as PlanningEventSnapshot;
}

describe('assignment swap expiry (issue #81)', () => {
  it('expires an open swap after event kickoff', () => {
    expect(shouldExpireAssignmentSwap(payload, snapshot(), Date.UTC(2026, 8, 10, 18, 1), 'UTC')).toBe(true);
  });

  it('expires an open swap when the published event is cancelled', () => {
    expect(shouldExpireAssignmentSwap(payload, snapshot('cancelled'), Date.UTC(2026, 8, 10, 10), 'UTC')).toBe(true);
  });

  it('expires an open swap when requester is no longer assigned in the published snapshot', () => {
    const current = snapshot();
    current.assignments.encadrant = [];
    expect(shouldExpireAssignmentSwap(payload, current, Date.UTC(2026, 8, 10, 10), 'UTC')).toBe(true);
  });

  it('keeps a future visible swap open while requester is still assigned', () => {
    expect(shouldExpireAssignmentSwap(payload, snapshot(), Date.UTC(2026, 8, 10, 10), 'UTC')).toBe(false);
  });

  it('never expires an already closed status through lifecycle evaluation', () => {
    expect(shouldExpireAssignmentSwap({ ...payload, status: 'approved' }, null, Date.UTC(2026, 8, 10, 19), 'UTC')).toBe(false);
  });
});
