import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import type { PlanningEventSnapshot } from './event-store';
import {
  applyReconfirmationResets,
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

  it('compte une annulation déjà publiée comme modification et non comme suppression', () => {
    const previous = snapshot('match-cancel-diff', 1, 'published');
    const cancelled = structuredClone(previous);
    cancelled.planningStatus = 'cancelled';
    if (cancelled.extras) cancelled.extras.planningStatus = 'cancelled';

    const diff = planningPublicationDiff([cancelled], [previous]);

    expect(diff.modified).toBe(1);
    expect(diff.removed).toBe(0);
    expect(diff.removedEvents).toEqual([]);
  });

  it('compte une réouverture en brouillon comme modification à republier (issue #71)', () => {
    const previous = snapshot('match-reopen-diff', 1, 'cancelled');
    if (previous.extras) previous.extras.planningStatus = 'cancelled';
    const reopened = structuredClone(previous);
    reopened.planningStatus = 'draft';
    if (reopened.extras) reopened.extras.planningStatus = 'draft';

    const diff = planningPublicationDiff([reopened], [previous]);

    expect(diff.modified).toBe(1);
    expect(diff.changed).toBe(1);
    expect(diff.removed).toBe(0);
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

describe('applyReconfirmationResets (issue #38)', () => {
  it('remet une acceptation à pending si le match est reprogrammé à une autre heure', () => {
    const assignee = { ...contact('Amine', 10), status: 'accepted' as const, respondedAt: '2026-08-01T10:00:00.000Z' };
    const previous = snapshot('match-5', 1, 'published');
    previous.assignments.encadrant = [assignee];
    const candidate = structuredClone(previous);
    candidate.time = '18:00';
    candidate.event = { ...candidate.event, time: '18:00' };

    const { snapshot: result, resets } = applyReconfirmationResets(previous, candidate);

    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({ eventType: 'amical', eventId: 'match-5', role: 'encadrant' });
    expect(result.assignments.encadrant[0]!.status).toBeUndefined();
    expect(result.assignments.encadrant[0]!.respondedAt).toBeUndefined();
  });

  it('remet un refus à pending si le lieu change', () => {
    const assignee = {
      ...contact('Sami', 11),
      status: 'declined' as const,
      declineReason: 'work' as const,
      declineComment: 'astreinte',
    };
    const previous = snapshot('match-6', 1, 'published');
    previous.assignments.arbitre = [assignee];
    const candidate = structuredClone(previous);
    candidate.location = 'Stade Municipal';

    const { snapshot: result, resets } = applyReconfirmationResets(previous, candidate);

    expect(resets).toHaveLength(1);
    expect(result.assignments.arbitre[0]).not.toHaveProperty('declineReason');
    expect(result.assignments.arbitre[0]).not.toHaveProperty('declineComment');
    expect(result.assignments.arbitre[0]!.status).toBeUndefined();
  });

  it('remet à pending quand le rôle de la personne change, même si l’horaire ne bouge pas', () => {
    const assignee = { ...contact('Yassine', 12), status: 'accepted' as const };
    const previous = snapshot('match-7', 1, 'published');
    previous.assignments.encadrant = [assignee];
    const candidate = structuredClone(previous);
    candidate.assignments.encadrant = [];
    candidate.assignments.accompagnateur = [assignee];

    const { snapshot: result, resets } = applyReconfirmationResets(previous, candidate);

    expect(resets).toHaveLength(1);
    expect(resets[0]!.role).toBe('accompagnateur');
    expect(result.assignments.accompagnateur[0]!.status).toBeUndefined();
  });

  it('réinitialise aussi la fenêtre de rappel lors d’une reconfirmation', () => {
    const assignee = {
      ...contact('Rappel ancien', 99),
      status: 'accepted' as const,
      assignedAt: '2026-08-01T08:00:00.000Z',
      respondedAt: '2026-08-01T09:00:00.000Z',
      remindersSent: ['72h', '24h'] as AssignmentContact['remindersSent'],
      lastReminderAt: '2026-08-10T08:00:00.000Z',
      reminderCount: 2,
    };
    const previous = snapshot('match-reminder-reset', 1, 'published');
    previous.assignments.encadrant = [assignee];
    const candidate = structuredClone(previous);
    candidate.time = '19:00';

    const resetAt = '2026-09-06T18:45:00.000Z';
    const { snapshot: result } = applyReconfirmationResets(previous, candidate, resetAt);
    const reset = result.assignments.encadrant[0]!;

    expect(reset.status).toBeUndefined();
    expect(reset.respondedAt).toBeUndefined();
    expect(reset.assignedAt).toBe(resetAt);
    expect(reset.remindersSent).toEqual([]);
    expect(reset.lastReminderAt).toBeUndefined();
    expect(reset.reminderCount).toBe(0);
  });

  it('conserve une acceptation existante quand rien de matériel ne change', () => {
    const assignee = { ...contact('Karim', 13), status: 'accepted' as const, respondedAt: '2026-08-01T10:00:00.000Z' };
    const previous = snapshot('match-8', 1, 'published');
    previous.assignments.encadrant = [assignee];
    const candidate = structuredClone(previous);
    // Changement purement descriptif (titre), aucun champ matériel touché.
    candidate.title = 'AFP – match-8 (mis à jour)';

    const { snapshot: result, resets } = applyReconfirmationResets(previous, candidate);

    expect(resets).toEqual([]);
    expect(result.assignments.encadrant[0]!.status).toBe('accepted');
    expect(result.assignments.encadrant[0]!.respondedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('ne touche pas un contact déjà pending', () => {
    const assignee = contact('Nouvel arrivant', 14);
    const previous = snapshot('match-9', 1, 'published');
    previous.assignments.encadrant = [assignee];
    const candidate = structuredClone(previous);
    candidate.time = '20:00';

    const { resets } = applyReconfirmationResets(previous, candidate);

    expect(resets).toEqual([]);
  });

  it('ne fait rien pour un événement jamais publié auparavant', () => {
    const assignee = { ...contact('Nadia', 15), status: 'accepted' as const };
    const candidate = snapshot('match-10', 0, 'draft');
    candidate.assignments.encadrant = [assignee];

    const { snapshot: result, resets } = applyReconfirmationResets(undefined, candidate);

    expect(resets).toEqual([]);
    expect(result).toBe(candidate);
  });
});
