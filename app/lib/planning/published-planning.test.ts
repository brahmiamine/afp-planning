import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import type { PlanningEventSnapshot } from './event-store';
import {
  buildPublishedPlanningPayload,
  computePerUserPublicationChanges,
  getPublishedPlanning,
  patchPublishedPlanningEvent,
  planningPublicationDiff,
  type PublishedPlanningPayload,
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

function makeStatefulDb(initialPayload: PublishedPlanningPayload | null): DataSource {
  let stored: Record<string, unknown> | null = initialPayload ? {
    id: 'published-planning:afp',
    clubId: 'afp',
    kind: 'published-planning',
    eventType: null,
    eventId: null,
    ownerUserId: initialPayload.publishedByUserId,
    personType: null,
    personId: null,
    payload: JSON.stringify(initialPayload),
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  } : null;

  const query = async (sql: string, params?: unknown[]) => {
    if (sql.includes('CREATE TABLE')) return [];
    if (sql.trim().startsWith('SELECT') && sql.includes('FROM planning_records')) {
      const [id, clubId] = params as [string, string];
      if (!stored || stored.id !== id || stored.clubId !== clubId) return [];
      return sql.includes('FOR UPDATE')
        ? [{ payload: stored.payload, ownerUserId: stored.ownerUserId }]
        : [stored];
    }
    if (sql.trim().startsWith('INSERT INTO planning_records')) {
      const [id, clubId, kind, eventType, eventId, ownerUserId, personType, personId, payload] = params as unknown[];
      stored = {
        id, clubId, kind, eventType, eventId, ownerUserId, personType, personId, payload,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
      };
      return [];
    }
    return [];
  };

  return {
    query,
    transaction: async (fn: (manager: { query: typeof query }) => Promise<void>) => fn({ query }),
    getRepository: () => ({ find: async () => [], findBy: async () => [] }),
  } as unknown as DataSource;
}

describe('patchPublishedPlanningEvent', () => {
  it('does nothing when the club has never published a global snapshot', async () => {
    const db = makeStatefulDb(null);
    await patchPublishedPlanningEvent(db, 'afp', snapshot('match-1', 2, 'published'));
    expect(await getPublishedPlanning(db, 'afp')).toBeNull();
  });

  it('does nothing when the event is not part of the published snapshot', async () => {
    const db = makeStatefulDb({
      schemaVersion: 1,
      publishedAt: '2026-08-01T00:00:00.000Z',
      publishedByUserId: 1,
      events: [snapshot('match-other', 1, 'published')],
    });
    await patchPublishedPlanningEvent(db, 'afp', snapshot('match-1', 2, 'published'));
    const after = await getPublishedPlanning(db, 'afp');
    expect(after?.events).toHaveLength(1);
    expect(after?.events[0]?.eventId).toBe('match-other');
  });

  it('replaces only the matching event, immediately, leaving the rest of the snapshot untouched', async () => {
    const previousMatch = snapshot('match-1', 1, 'published');
    previousMatch.assignments.arbitre = [
      { nom: 'Ancien', numero: '', personId: 1, personType: 'officiel', status: 'pending' },
    ];
    const other = snapshot('match-other', 1, 'published');
    const db = makeStatefulDb({
      schemaVersion: 1,
      publishedAt: '2026-08-01T00:00:00.000Z',
      publishedByUserId: 1,
      events: [previousMatch, other],
    });

    const liveAfterSwap = snapshot('match-1', 2, 'published');
    liveAfterSwap.assignments.arbitre = [
      { nom: 'Remplaçant', numero: '', personId: 2, personType: 'officiel', status: 'accepted' },
    ];

    await patchPublishedPlanningEvent(db, 'afp', liveAfterSwap);

    const after = await getPublishedPlanning(db, 'afp');
    expect(after?.events).toHaveLength(2);
    const patched = after?.events.find((event) => event.eventId === 'match-1');
    expect(patched?.assignments.arbitre[0]?.personId).toBe(2);
    expect(patched?.assignments.arbitre[0]?.status).toBe('accepted');
    expect(patched?.planningStatus).toBe('published');
    const unaffected = after?.events.find((event) => event.eventId === 'match-other');
    expect(unaffected).toEqual(other);
  });

  it('does not patch a snapshot published under a different club', async () => {
    const db = makeStatefulDb({
      schemaVersion: 1,
      publishedAt: '2026-08-01T00:00:00.000Z',
      publishedByUserId: 1,
      events: [snapshot('match-1', 1, 'published')],
    });
    await patchPublishedPlanningEvent(db, 'other-club', snapshot('match-1', 2, 'published'));
    const after = await getPublishedPlanning(db, 'afp');
    expect(after?.events[0]?.eventId).toBe('match-1');
    expect((after?.events[0] as unknown as { revision: number }).revision).toBe(1);
  });
});

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

  it('conserve visible un événement annulé qui avait déjà été publié (issue #40)', () => {
    const cancelledButPreviouslyPublished = snapshot('match-2', 2, 'cancelled');
    const neverPublishedCancelled = snapshot('match-3', 1, 'cancelled');
    const payload = buildPublishedPlanningPayload(
      { id: 7 },
      [snapshot('match-1', 2), cancelledButPreviouslyPublished, neverPublishedCancelled],
      '2026-09-06T15:00:00.000Z',
      new Set(['amical:match-1', 'amical:match-2']),
    );

    expect(payload.events.map((event) => event.eventId).sort()).toEqual(['match-1', 'match-2']);
    const cancelled = payload.events.find((event) => event.eventId === 'match-2');
    expect(cancelled?.planningStatus).toBe('cancelled');
    expect(cancelled?.extras?.planningStatus).toBe('cancelled');
    const stillPublished = payload.events.find((event) => event.eventId === 'match-1');
    expect(stillPublished?.planningStatus).toBe('published');
  });

  it('summarizes additions modifications and removals against the last publication', () => {
    const previous = [snapshot('match-1', 1, 'published'), snapshot('match-old', 4, 'published')];
    const changed = snapshot('match-1', 2, 'modified');
    changed.time = '16:00';
    changed.event = { ...changed.event, time: '16:00' };
    const current = [changed, snapshot('match-new', 1, 'draft')];

    const diff = planningPublicationDiff(current, previous);
    expect(diff).toMatchObject({
      current: 2,
      published: 2,
      added: 1,
      modified: 1,
      removed: 1,
      unchanged: 0,
      changed: 3,
    });
    expect(diff.removedEvents).toEqual([{
      eventType: 'amical',
      eventId: 'match-old',
      title: 'AFP – match-old',
      date: '12/09/2026',
      time: '15:00',
    }]);
  });

  it('orders removed events chronologically regardless of DB read order', () => {
    const later = snapshot('match-later', 1, 'published');
    later.date = '20/09/2026';
    later.time = '10:00';
    const earlier = snapshot('match-earlier', 1, 'published');
    earlier.date = '13/09/2026';
    earlier.time = '18:00';
    const middle = snapshot('match-middle', 1, 'published');
    middle.date = '13/09/2026';
    middle.time = '10:00';

    // Ordre volontairement non chronologique en entrée, pour vérifier que le diff trie lui-même.
    const diff = planningPublicationDiff([], [later, earlier, middle]);

    expect(diff.removedEvents.map((event) => event.eventId)).toEqual([
      'match-middle',
      'match-earlier',
      'match-later',
    ]);
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

  it('notifie une annulation même quand l’événement reste dans le nouveau snapshot publié (issue #40)', () => {
    const assignee = contact('Retained', 6);
    const previous = snapshot('match-cancel', 1, 'published');
    previous.assignments.encadrant = [assignee];
    const next = structuredClone(previous);
    next.planningStatus = 'cancelled';

    const changes = computePerUserPublicationChanges([previous], [next], [next]);
    expect(changes).toEqual([expect.objectContaining({ kind: 'cancelled', contact: assignee })]);

    // Republier une deuxième fois sans rien changer ne doit pas renvoyer une deuxième notification.
    const republished = computePerUserPublicationChanges([next], [next], [next]);
    expect(republished).toEqual([]);
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

  it('does not treat a decline between two publications as a removal', () => {
    const assignee = contact('Declines Later', 5);
    const previous = snapshot('match-4', 1, 'published');
    previous.assignments.encadrant = [{ ...assignee, status: 'accepted' }];
    const next = structuredClone(previous);
    next.assignments.encadrant = [{ ...assignee, status: 'declined' }];

    const changes = computePerUserPublicationChanges([previous], [next], [next]);

    expect(changes).toEqual([]);
  });
});
