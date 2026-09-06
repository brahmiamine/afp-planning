import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type { AssignmentContact } from '@/types/match';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { assignmentStatus } from './p0-rules';
import {
  getPlanningRecord,
  savePlanningRecord,
} from './records';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';

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

export type PublicationChangeKind = 'added' | 'removed' | 'rescheduled' | 'cancelled';

export interface PublicationPersonChange {
  contact: AssignmentContact;
  eventType: PlanningEventSnapshot['eventType'];
  eventId: string;
  role: PlanningRole;
  kind: PublicationChangeKind;
  message: string;
}

/**
 * Contacts à notifier parmi une liste : un refus n'a pas besoin qu'on lui redise que
 * l'affectation qu'il vient de refuser a changé. N'utiliser que pour décider qui reçoit
 * un message — jamais pour détecter une présence/absence structurelle (un refus reste
 * structurellement présent, ce n'est pas un retrait).
 */
function notifiableContacts(contacts: AssignmentContact[] | undefined): AssignmentContact[] {
  return (contacts ?? []).filter((contact) => assignmentStatus(contact) !== 'declined');
}

/**
 * Diff par personne entre deux publications globales, pour remplacer une notification
 * générique unique par des messages ciblés : nouvelle affectation, horaire modifié,
 * affectation supprimée, événement annulé. `allCurrentLive` (non filtré, y compris les
 * événements annulés) sert uniquement à distinguer "annulé" de "supprimé du planning".
 */
export function computePerUserPublicationChanges(
  previousPublished: PlanningEventSnapshot[],
  newPublished: PlanningEventSnapshot[],
  allCurrentLive: PlanningEventSnapshot[],
): PublicationPersonChange[] {
  const previousByKey = new Map(previousPublished.map((snapshot) => [eventKey(snapshot), snapshot]));
  const newByKey = new Map(newPublished.map((snapshot) => [eventKey(snapshot), snapshot]));
  const liveByKey = new Map(allCurrentLive.map((snapshot) => [eventKey(snapshot), snapshot]));
  const roles: PlanningRole[] = ['arbitre', 'encadrant', 'accompagnateur'];
  const changes: PublicationPersonChange[] = [];
  const allKeys = new Set([...previousByKey.keys(), ...newByKey.keys()]);

  for (const key of allKeys) {
    const previous = previousByKey.get(key);
    const next = newByKey.get(key);

    if (previous && !next) {
      const wasCancelled = liveByKey.get(key)?.planningStatus === 'cancelled';
      for (const role of roles) {
        // Membre présent = qu'il ait accepté, refusé ou pas répondu : un refus n'est
        // jamais un retrait. On ne notifie en revanche que ceux qui n'ont pas déjà
        // refusé — inutile de leur dire que l'affectation qu'ils ont refusée disparaît.
        for (const contact of notifiableContacts(previous.assignments[role])) {
          changes.push({
            contact,
            eventType: previous.eventType,
            eventId: previous.eventId,
            role,
            kind: wasCancelled ? 'cancelled' : 'removed',
            message: wasCancelled
              ? `Événement annulé : ${previous.title} (${previous.date} ${previous.time}).`
              : `Affectation supprimée : ${previous.title} (${previous.date} ${previous.time}) ne fait plus partie du planning publié.`,
          });
        }
      }
      continue;
    }

    if (!previous && next) {
      for (const role of roles) {
        for (const contact of notifiableContacts(next.assignments[role])) {
          changes.push({
            contact,
            eventType: next.eventType,
            eventId: next.eventId,
            role,
            kind: 'added',
            message: `Nouvelle affectation : ${next.title} (${next.date} ${next.time}).`,
          });
        }
      }
      continue;
    }

    if (previous && next) {
      const rescheduled = previous.date !== next.date || previous.time !== next.time;
      for (const role of roles) {
        // Comparaisons de présence sur les listes brutes (refusé inclus) : un refus
        // entre deux publications ne doit jamais se lire comme un retrait ou un ajout.
        const previousContacts = previous.assignments[role] ?? [];
        const nextContacts = next.assignments[role] ?? [];

        for (const contact of notifiableContacts(nextContacts)) {
          const wasThere = previousContacts.some((candidate) => sameContact(candidate, contact));
          if (!wasThere) {
            changes.push({
              contact,
              eventType: next.eventType,
              eventId: next.eventId,
              role,
              kind: 'added',
              message: `Nouvelle affectation : ${next.title} (${next.date} ${next.time}).`,
            });
          } else if (rescheduled) {
            changes.push({
              contact,
              eventType: next.eventType,
              eventId: next.eventId,
              role,
              kind: 'rescheduled',
              message: `Horaire modifié : ${next.title} a désormais lieu le ${next.date} à ${next.time}.`,
            });
          }
        }

        for (const contact of notifiableContacts(previousContacts)) {
          const stillThere = nextContacts.some((candidate) => sameContact(candidate, contact));
          if (!stillThere) {
            changes.push({
              contact,
              eventType: previous.eventType,
              eventId: previous.eventId,
              role,
              kind: 'removed',
              message: `Affectation supprimée : vous n'êtes plus affecté(e) sur ${previous.title} (${previous.date} ${previous.time}).`,
            });
          }
        }
      }
    }
  }

  return changes;
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
  clubId?: string,
): Promise<PlanningEventSnapshot[] | null> {
  return (await getPublishedPlanning(db, clubId))?.events ?? null;
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
