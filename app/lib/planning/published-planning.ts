import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { getCurrentClubId } from '@/lib/auth/club-context';
import {
  getPlanningRecord,
  savePlanningRecord,
} from './records';
import type { PlanningEventSnapshot } from './event-store';

export interface PublishedPlanningPayload {
  schemaVersion: 1;
  publishedAt: string;
  publishedByUserId: number;
  events: PlanningEventSnapshot[];
}

export interface PlanningPublicationDiff {
  current: number;
  published: number;
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
  changed: number;
}

function recordId(clubId: string): string {
  return `published-planning:${clubId}`;
}

function eventKey(snapshot: PlanningEventSnapshot): string {
  return `${snapshot.eventType}:${snapshot.eventId}`;
}

function stripPublicationMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const {
    planningStatus: _planningStatus,
    planningRevision: _planningRevision,
    publishedAt: _publishedAt,
    publishedByUserId: _publishedByUserId,
    modifiedAfterPublishAt: _modifiedAfterPublishAt,
    cancelledAt: _cancelledAt,
    cancelledByUserId: _cancelledByUserId,
    cancellationReason: _cancellationReason,
    ...rest
  } = value;
  return rest;
}

function comparableSnapshot(snapshot: PlanningEventSnapshot) {
  const structuralContacts = (role: keyof PlanningEventSnapshot['assignments']) =>
    snapshot.assignments[role].map((contact) => ({
      nom: contact.nom,
      numero: contact.numero,
      personId: contact.personId ?? null,
      personType: contact.personType ?? null,
    }));
  return {
    eventType: snapshot.eventType,
    eventId: snapshot.eventId,
    title: snapshot.title,
    date: snapshot.date,
    time: snapshot.time,
    durationMinutes: snapshot.durationMinutes,
    location: snapshot.location,
    event: (() => {
      const event = stripPublicationMetadata(snapshot.event as unknown as Record<string, unknown>);
      delete event.encadrants;
      return event;
    })(),
    assignments: {
      arbitre: structuralContacts('arbitre'),
      encadrant: structuralContacts('encadrant'),
      accompagnateur: structuralContacts('accompagnateur'),
    },
  };
}

function samePublishedContent(left: PlanningEventSnapshot, right: PlanningEventSnapshot): boolean {
  return JSON.stringify(comparableSnapshot(left)) === JSON.stringify(comparableSnapshot(right));
}

function sameContact(
  left: PlanningEventSnapshot['assignments']['arbitre'][number],
  right: PlanningEventSnapshot['assignments']['arbitre'][number],
): boolean {
  if (
    left.personId !== undefined
    && left.personType
    && right.personId !== undefined
    && right.personType
  ) {
    return left.personId === right.personId && left.personType === right.personType;
  }
  return left.nom.trim().toLowerCase() === right.nom.trim().toLowerCase();
}

function overlayContactState(
  published: PlanningEventSnapshot['assignments']['arbitre'][number],
  live: PlanningEventSnapshot['assignments']['arbitre'][number] | undefined,
) {
  if (!live) return published;
  return {
    ...published,
    status: live.status,
    respondedAt: live.respondedAt,
    declineReason: live.declineReason,
    declineComment: live.declineComment,
    attendanceStatus: live.attendanceStatus,
    attendanceUpdatedAt: live.attendanceUpdatedAt,
    remindersSent: live.remindersSent,
    lastReminderAt: live.lastReminderAt,
    reminderCount: live.reminderCount,
  };
}

export function overlayPublishedPlanningOperationalState(
  publishedSnapshots: PlanningEventSnapshot[],
  liveSnapshots: PlanningEventSnapshot[],
): PlanningEventSnapshot[] {
  const liveByKey = new Map(liveSnapshots.map((snapshot) => [eventKey(snapshot), snapshot]));
  return publishedSnapshots.map((published) => {
    const live = liveByKey.get(eventKey(published));
    if (!live) return published;

    const assignments = {
      arbitre: published.assignments.arbitre.map((contact) =>
        overlayContactState(contact, live.assignments.arbitre.find((candidate) => sameContact(contact, candidate))),
      ),
      encadrant: published.assignments.encadrant.map((contact) =>
        overlayContactState(contact, live.assignments.encadrant.find((candidate) => sameContact(contact, candidate))),
      ),
      accompagnateur: published.assignments.accompagnateur.map((contact) =>
        overlayContactState(contact, live.assignments.accompagnateur.find((candidate) => sameContact(contact, candidate))),
      ),
    };

    const event = published.eventType === 'entrainement' || published.eventType === 'plateau'
      ? { ...published.event, encadrants: assignments.encadrant }
      : published.event;
    const extras = published.extras
      ? {
          ...published.extras,
          arbitreTouche: assignments.arbitre,
          contactEncadrants: assignments.encadrant,
          contactAccompagnateur: assignments.accompagnateur,
        }
      : null;

    return { ...published, event, extras, assignments };
  });
}

function asPublished(snapshot: PlanningEventSnapshot): PlanningEventSnapshot {
  const event = { ...snapshot.event, planningStatus: 'published' } as PlanningEventSnapshot['event'];
  const extras: PlanningEventSnapshot['extras'] = snapshot.extras
    ? { ...snapshot.extras, planningStatus: 'published' as const }
    : null;
  return {
    ...snapshot,
    planningStatus: 'published',
    event,
    extras,
    assignments: {
      arbitre: [...snapshot.assignments.arbitre],
      encadrant: [...snapshot.assignments.encadrant],
      accompagnateur: [...snapshot.assignments.accompagnateur],
    },
  };
}

export function buildPublishedPlanningPayload(
  user: Pick<SessionUser, 'id'>,
  snapshots: PlanningEventSnapshot[],
  publishedAt = new Date().toISOString(),
): PublishedPlanningPayload {
  return {
    schemaVersion: 1,
    publishedAt,
    publishedByUserId: user.id,
    events: snapshots
      .filter((snapshot) => snapshot.planningStatus !== 'cancelled')
      .map(asPublished),
  };
}

export function planningPublicationDiff(
  currentSnapshots: PlanningEventSnapshot[],
  publishedSnapshots: PlanningEventSnapshot[],
): PlanningPublicationDiff {
  const current = new Map(
    currentSnapshots
      .filter((snapshot) => snapshot.planningStatus !== 'cancelled')
      .map((snapshot) => [eventKey(snapshot), snapshot]),
  );
  const published = new Map(publishedSnapshots.map((snapshot) => [eventKey(snapshot), snapshot]));

  let added = 0;
  let modified = 0;
  let removed = 0;
  let unchanged = 0;

  for (const [key, snapshot] of current) {
    const previous = published.get(key);
    if (!previous) {
      added += 1;
      continue;
    }
    if (!samePublishedContent(snapshot, previous)) modified += 1;
    else unchanged += 1;
  }

  for (const key of published.keys()) {
    if (!current.has(key)) removed += 1;
  }

  return {
    current: current.size,
    published: published.size,
    added,
    modified,
    removed,
    unchanged,
    changed: added + modified + removed,
  };
}

export async function getPublishedPlanning(
  db: DataSource,
  clubId = getCurrentClubId(),
): Promise<PublishedPlanningPayload | null> {
  const record = await getPlanningRecord<PublishedPlanningPayload>(db, recordId(clubId));
  if (!record || record.kind !== 'published-planning') return null;
  const payload = record.payload;
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.events)) return null;
  return payload;
}

export async function listPublishedPlanningEventSnapshots(
  db: DataSource,
): Promise<PlanningEventSnapshot[] | null> {
  return (await getPublishedPlanning(db))?.events ?? null;
}

export async function getPublishedPlanningEventSnapshot(
  db: DataSource,
  eventType: PlanningEventSnapshot['eventType'],
  eventId: string,
): Promise<PlanningEventSnapshot | null> {
  const snapshots = await listPublishedPlanningEventSnapshots(db);
  if (!snapshots) return null;
  return snapshots.find((snapshot) => snapshot.eventType === eventType && snapshot.eventId === eventId) ?? null;
}

export async function savePublishedPlanning(
  db: DataSource,
  user: SessionUser,
  snapshots: PlanningEventSnapshot[],
  publishedAt = new Date().toISOString(),
): Promise<PublishedPlanningPayload> {
  const payload = buildPublishedPlanningPayload(user, snapshots, publishedAt);
  await savePlanningRecord(db, {
    id: recordId(user.clubId),
    kind: 'published-planning',
    clubId: user.clubId,
    ownerUserId: user.id,
    payload,
  });
  return payload;
}
