import { describe, expect, it } from 'vitest';
import type { AssignmentContact } from '@/types/match';
import type { PlanningEventSnapshot } from './event-store';
import {
  buildPublishedPlanningPayload,
  computePerUserPublicationChanges,
  planningPublicationDiff,
} from './published-planning';

function snapshot(id: string, revision: number, status: PlanningEventSnapshot['planningStatus'] = 'draft'): PlanningEventSnapshot {
  return {
    eventId: id,
    eventType: 'amical',
    title: `AFP – ${id}`,
    date: '12/09/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: status,
    event: {
      id,
      type: 'amical',
      date: '12/09/2026',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: id,
      venue: 'domicile',
      planningRevision: revision,
    },
    extras: { id, planningRevision: revision },
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    revision,
  };
}

describe('global published planning snapshot', () => {
  it('freezes events as published and excludes cancelled drafts', () => {
    const payload = buildPublishedPlanningPayload(
      { id: 7 },
      [snapshot('match-1', 2), snapshot('match-2', 1, 'cancelled')],
      '2026-09-06T15:00:00.000Z',
    );

    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]?.eventId).toBe('match-1');
    expect(payload.events[0]?.planningStatus).toBe('published');
    expect(payload.events[0]?.extras?.planningStatus).toBe('published');
  });

  it('summarizes additions modifications and removals against the last publication', () => {
    const previous = [snapshot('match-1', 1, 'published'), snapshot('match-old', 4, 'published')];
    const changed = snapshot('match-1', 2, 'modified');
    changed.time = '16:00';
    changed.event = { ...changed.event, time: '16:00' };
    const current = [changed, snapshot('match-new', 1, 'draft')];

    expect(planningPublicationDiff(current, previous)).toMatchObject({
      current: 2,
      published: 2,
      added: 1,
      modified: 1,
      removed: 1,
      unchanged: 0,
      changed: 3,
    });
  });

  it('does not require republication for an acceptance response only', () => {
    const previous = snapshot('match-1', 1, 'published');
    previous.assignments.arbitre = [{
      nom: 'Jean Dupont',
      numero: '0600000000',
      personId: 7,
      personType: 'officiel',
      status: 'pending',
    }];
    const current = structuredClone(previous);
    current.assignments.arbitre[0] = {
      ...current.assignments.arbitre[0]!,
      status: 'accepted',
      respondedAt: '2026-09-06T15:30:00.000Z',
    };

    expect(planningPublicationDiff([current], [previous]).changed).toBe(0);
  });
});

function contact(nom: string, personId: number): AssignmentContact {
  return { nom, numero: '', personId, personType: 'officiel', status: 'pending' };
}

describe('computePerUserPublicationChanges', () => {
  it('notifies a new assignee and does not notify someone whose assignment is unchanged', () => {
    const untouched = contact('Untouched', 1);
    const previous = snapshot('match-1', 1, 'published');
    previous.assignments.arbitre = [untouched];
    const next = structuredClone(previous);
    next.assignments.arbitre = [untouched, contact('New Arbitre', 2)];

    const changes = computePerUserPublicationChanges([previous], [next], [next]);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'added', contact: { personId: 2 } });
  });

  it('tells someone their assignment was removed, distinct from an event cancellation', () => {
    const removedAssignee = contact('Removed', 3);
    const previous = snapshot('match-2', 1, 'published');
    previous.assignments.encadrant = [removedAssignee];
    const stillLive = structuredClone(previous);
    stillLive.assignments.encadrant = [];

    const removalChanges = computePerUserPublicationChanges([previous], [], [stillLive]);
    expect(removalChanges).toEqual([expect.objectContaining({ kind: 'removed', contact: removedAssignee })]);

    const cancelledLive = { ...stillLive, planningStatus: 'cancelled' as const };
    const cancellationChanges = computePerUserPublicationChanges([previous], [], [cancelledLive]);
    expect(cancellationChanges).toEqual([expect.objectContaining({ kind: 'cancelled', contact: removedAssignee })]);
  });

  it('notifies everyone still assigned when the schedule changes, but not about their assignment', () => {
    const assignee = contact('Still Assigned', 4);
    const previous = snapshot('match-3', 1, 'published');
    previous.assignments.arbitre = [assignee];
    const next = structuredClone(previous);
    next.time = '18:00';
    next.assignments.arbitre = [assignee];

    const changes = computePerUserPublicationChanges([previous], [next], [next]);

    expect(changes).toEqual([expect.objectContaining({ kind: 'rescheduled', contact: assignee })]);
  });
});
