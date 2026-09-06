import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { PlanningEventSnapshot } from './event-store';
import {
  buildPublishedPlanningPayload,
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

  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return [];
      if (sql.trim().startsWith('SELECT') && sql.includes('FROM planning_records')) {
        return stored ? [stored] : [];
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
    },
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
