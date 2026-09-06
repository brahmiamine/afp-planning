import type { DataSource, EntityManager } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type { AssignmentContact } from '@/types/match';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { assignmentStatus, eventStartTimestamp } from './p0-rules';
import {
  ensurePlanningSupportTables,
  getPlanningRecord,
  savePlanningRecord,
} from './records';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';

type Queryable = DataSource | EntityManager;

export interface PublishedPlanningPayload {
  schemaVersion: 1;
  publishedAt: string;
  publishedByUserId: number;
  events: PlanningEventSnapshot[];
}

/**
 * Historique des événements sortis de la fenêtre de publication (issue #42) : la source
 * dédiée qui conserve ce que le snapshot publié actif ne porte plus.
 */
export interface PublishedPlanningHistoryPayload {
  schemaVersion: 1;
  events: PlanningEventSnapshot[];
}

export interface PlanningPublicationDiffEvent {
  eventType: PlanningEventSnapshot['eventType'];
  eventId: PlanningEventSnapshot['eventId'];
  title: PlanningEventSnapshot['title'];
  date: PlanningEventSnapshot['date'];
  time: PlanningEventSnapshot['time'];
}

export interface PlanningPublicationDiff {
  current: number;
  published: number;
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
  changed: number;
  /** Nommés explicitement : une suppression ne doit jamais rester un simple compteur. */
  removedEvents: PlanningPublicationDiffEvent[];
}

function recordId(clubId: string): string {
  return `published-planning:${clubId}`;
}

function historyRecordId(clubId: string): string {
  return `published-planning-history:${clubId}`;
}

export function eventKey(snapshot: PlanningEventSnapshot): string {
  return `${snapshot.eventType}:${snapshot.eventId}`;
}

/* --------------------------------------------------------------------------
 * Fenêtre de publication (issue #42)
 *
 * Règle : le snapshot publié actif porte les événements de J-7 (00:00, heure du
 * club) jusqu'au futur. Les événements plus anciens sont versés dans
 * l'historique (`published-planning-history:<clubId>`) et ne sont plus jamais
 * validés ni republicationnés : un vieux match incomplet ne peut donc pas
 * bloquer la publication d'un planning futur, et le snapshot reste borné.
 *
 * La profondeur de la fenêtre est configurable via la variable d'environnement
 * PLANNING_PUBLICATION_PAST_DAYS (entier 0-90, défaut : 7).
 * ------------------------------------------------------------------------ */

export const DEFAULT_PUBLICATION_WINDOW_PAST_DAYS = 7;

export function publicationWindowPastDays(): number {
  const raw = Number(process.env.PLANNING_PUBLICATION_PAST_DAYS);
  return Number.isInteger(raw) && raw >= 0 && raw <= 90 ? raw : DEFAULT_PUBLICATION_WINDOW_PAST_DAYS;
}

/** Début de la fenêtre de publication : J-`pastDays` à 00:00 dans le fuseau du club. */
export function publicationWindowStart(
  now: number,
  timeZone: string,
  pastDays = publicationWindowPastDays(),
): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(now));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    if (!year || !month || !day) return null;
    const base = new Date(Date.UTC(year, month - 1, day - pastDays));
    const date = `${String(base.getUTCDate()).padStart(2, '0')}/${String(base.getUTCMonth() + 1).padStart(2, '0')}/${base.getUTCFullYear()}`;
    return eventStartTimestamp(date, '00:00', timeZone);
  } catch {
    return null;
  }
}

/**
 * Un événement est dans la fenêtre de publication s'il commence au plus tôt au début de
 * la fenêtre. Un horaire inexploitable (`start === null`) reste « dans la fenêtre » : il
 * doit continuer d'être validé pour que l'erreur de saisie soit signalée au lieu d'être
 * silencieusement ignorée. Si la fenêtre elle-même est incalculable, on ne filtre rien.
 */
export function isWithinPublicationWindow(
  snapshot: Pick<PlanningEventSnapshot, 'date' | 'time'>,
  windowStart: number | null,
  timeZone: string,
): boolean {
  if (windowStart === null) return true;
  const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
  return start === null || start >= windowStart;
}

/** Ajoute des événements à l'historique publié du club (dédoublonné par clé d'événement). */
export async function appendPublishedPlanningHistory(
  db: Queryable,
  user: Pick<SessionUser, 'id' | 'clubId'>,
  events: PlanningEventSnapshot[],
): Promise<void> {
  if (!events.length) return;
  const id = historyRecordId(user.clubId);
  const record = await getPlanningRecord<PublishedPlanningHistoryPayload>(db, id);
  const existing = record?.payload?.schemaVersion === 1 && Array.isArray(record.payload.events)
    ? record.payload.events
    : [];
  const byKey = new Map(existing.map((event) => [eventKey(event), event]));
  for (const event of events) byKey.set(eventKey(event), event);
  await savePlanningRecord(db, {
    id,
    kind: 'published-planning-history',
    clubId: user.clubId,
    ownerUserId: user.id,
    payload: { schemaVersion: 1, events: [...byKey.values()] },
  });
}

export async function getPublishedPlanningHistory(
  db: Queryable,
  clubId = getCurrentClubId(),
): Promise<PublishedPlanningHistoryPayload | null> {
  const record = await getPlanningRecord<PublishedPlanningHistoryPayload>(db, historyRecordId(clubId));
  if (!record || record.kind !== 'published-planning-history') return null;
  const payload = record.payload;
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.events)) return null;
  return payload;
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

const ASSIGNMENT_ROLES: PlanningRole[] = ['arbitre', 'encadrant', 'accompagnateur'];

export interface ReconfirmationReset {
  eventType: PlanningEventSnapshot['eventType'];
  eventId: string;
  role: PlanningRole;
  /** Contact tel qu'il était avant la remise à zéro (pour connaître son ancien statut/motif). */
  contact: AssignmentContact;
}

function materialRendezVous(event: PlanningEventSnapshot['event']): string | null {
  const value = (event as { horaireRendezVous?: unknown }).horaireRendezVous;
  return typeof value === 'string' ? value : null;
}

function findPreviousRole(previous: PlanningEventSnapshot, contact: AssignmentContact): PlanningRole | null {
  for (const role of ASSIGNMENT_ROLES) {
    if (previous.assignments[role].some((candidate) => sameContact(candidate, contact))) return role;
  }
  return null;
}

function clearedContact(contact: AssignmentContact, assignedAt: string): AssignmentContact {
  const {
    status: _status,
    assignedAt: _assignedAt,
    respondedAt: _respondedAt,
    declineReason: _declineReason,
    declineComment: _declineComment,
    remindersSent: _remindersSent,
    lastReminderAt: _lastReminderAt,
    reminderCount: _reminderCount,
    ...rest
  } = contact;
  return {
    ...rest,
    assignedAt,
    remindersSent: [],
    reminderCount: 0,
  };
}

/**
 * Une acceptation ou un refus déjà enregistré ne doit jamais être réutilisé tel quel si les
 * conditions matérielles de l'événement ont changé depuis la dernière publication (date, heure,
 * lieu, horaire de rendez-vous) ou si le rôle de la personne a changé : on force une nouvelle
 * confirmation en remettant le contact à `pending`. Les changements purement descriptifs (qui ne
 * touchent à aucun de ces champs) conservent l'acceptation existante.
 */
export function applyReconfirmationResets(
  previous: PlanningEventSnapshot | undefined,
  candidate: PlanningEventSnapshot,
  resetAt = new Date().toISOString(),
): { snapshot: PlanningEventSnapshot; resets: ReconfirmationReset[] } {
  if (!previous) return { snapshot: candidate, resets: [] };

  const eventChanged = previous.date !== candidate.date
    || previous.time !== candidate.time
    || previous.location !== candidate.location
    || materialRendezVous(previous.event) !== materialRendezVous(candidate.event);

  const resets: ReconfirmationReset[] = [];
  const assignments = {
    arbitre: [...candidate.assignments.arbitre],
    encadrant: [...candidate.assignments.encadrant],
    accompagnateur: [...candidate.assignments.accompagnateur],
  };

  for (const role of ASSIGNMENT_ROLES) {
    assignments[role] = candidate.assignments[role].map((contact) => {
      if (assignmentStatus(contact) === 'pending') return contact;
      const previousRole = findPreviousRole(previous, contact);
      const roleChanged = previousRole !== null && previousRole !== role;
      if (!eventChanged && !roleChanged) return contact;
      resets.push({ eventType: candidate.eventType, eventId: candidate.eventId, role, contact });
      return clearedContact(contact, resetAt);
    });
  }

  if (resets.length === 0) return { snapshot: candidate, resets: [] };

  const event = candidate.eventType === 'entrainement' || candidate.eventType === 'plateau'
    ? { ...candidate.event, encadrants: assignments.encadrant }
    : candidate.event;
  const extras = candidate.extras
    ? {
        ...candidate.extras,
        arbitreTouche: assignments.arbitre,
        contactEncadrants: assignments.encadrant,
        contactAccompagnateur: assignments.accompagnateur,
      }
    : null;

  return { snapshot: { ...candidate, event, extras, assignments }, resets };
}

function asPublished(snapshot: PlanningEventSnapshot, keepCancelled = false): PlanningEventSnapshot {
  const status = keepCancelled && snapshot.planningStatus === 'cancelled' ? 'cancelled' : 'published';
  const event = { ...snapshot.event, planningStatus: status } as PlanningEventSnapshot['event'];
  const extras: PlanningEventSnapshot['extras'] = snapshot.extras
    ? { ...snapshot.extras, planningStatus: status }
    : null;
  return {
    ...snapshot,
    planningStatus: status,
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
  previouslyPublishedKeys: ReadonlySet<string> = new Set(),
): PublishedPlanningPayload {
  return {
    schemaVersion: 1,
    publishedAt,
    publishedByUserId: user.id,
    events: snapshots
      .filter((snapshot) => snapshot.planningStatus !== 'cancelled' || previouslyPublishedKeys.has(eventKey(snapshot)))
      .map((snapshot) => asPublished(snapshot, previouslyPublishedKeys.has(eventKey(snapshot)))),
  };
}

export function planningPublicationDiff(
  currentSnapshots: PlanningEventSnapshot[],
  publishedSnapshots: PlanningEventSnapshot[],
): PlanningPublicationDiff {
  const published = new Map(publishedSnapshots.map((snapshot) => [eventKey(snapshot), snapshot]));
  const current = new Map(
    currentSnapshots
      .filter((snapshot) => snapshot.planningStatus !== 'cancelled' || published.has(eventKey(snapshot)))
      .map((snapshot) => [eventKey(snapshot), snapshot]),
  );

  let added = 0;
  let modified = 0;
  let unchanged = 0;
  const removedEvents: PlanningPublicationDiffEvent[] = [];

  for (const [key, snapshot] of current) {
    const previous = published.get(key);
    if (!previous) {
      added += 1;
      continue;
    }
    const justCancelled = snapshot.planningStatus === 'cancelled' && previous.planningStatus !== 'cancelled';
    if (justCancelled || !samePublishedContent(snapshot, previous)) modified += 1;
    else unchanged += 1;
  }

  for (const [key, snapshot] of published) {
    if (current.has(key)) continue;
    removedEvents.push({
      eventType: snapshot.eventType,
      eventId: snapshot.eventId,
      title: snapshot.title,
      date: snapshot.date,
      time: snapshot.time,
    });
  }
  // Ordre chronologique déterministe : les résultats DB n'ont pas d'ordre garanti,
  // et une simple clé de tri stable (eventType:eventId) en repli pour les horaires invalides.
  removedEvents.sort((a, b) => {
    const diff = (eventStartTimestamp(a.date, a.time) ?? 0) - (eventStartTimestamp(b.date, b.time) ?? 0);
    if (diff !== 0) return diff;
    return `${a.eventType}:${a.eventId}`.localeCompare(`${b.eventType}:${b.eventId}`);
  });

  return {
    current: current.size,
    published: published.size,
    added,
    modified,
    removed: removedEvents.length,
    unchanged,
    changed: added + modified + removedEvents.length,
    removedEvents,
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
      const justCancelled = previous.planningStatus !== 'cancelled' && next.planningStatus === 'cancelled';
      if (justCancelled) {
        for (const role of roles) {
          for (const contact of notifiableContacts(previous.assignments[role])) {
            changes.push({
              contact,
              eventType: previous.eventType,
              eventId: previous.eventId,
              role,
              kind: 'cancelled',
              message: `Événement annulé : ${previous.title} (${previous.date} ${previous.time}).`,
            });
          }
        }
        continue;
      }
      if (next.planningStatus === 'cancelled') continue;

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
  db: Queryable,
  clubId = getCurrentClubId(),
): Promise<PublishedPlanningPayload | null> {
  const record = await getPlanningRecord<PublishedPlanningPayload>(db, recordId(clubId));
  if (!record || record.kind !== 'published-planning') return null;
  const payload = record.payload;
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.events)) return null;
  return payload;
}

export async function listPublishedPlanningEventSnapshots(
  db: Queryable,
  clubId?: string,
): Promise<PlanningEventSnapshot[] | null> {
  return (await getPublishedPlanning(db, clubId))?.events ?? null;
}

export async function getPublishedPlanningEventSnapshot(
  db: Queryable,
  eventType: PlanningEventSnapshot['eventType'],
  eventId: string,
): Promise<PlanningEventSnapshot | null> {
  const snapshots = await listPublishedPlanningEventSnapshots(db);
  if (!snapshots) return null;
  return snapshots.find((snapshot) => snapshot.eventType === eventType && snapshot.eventId === eventId) ?? null;
}

export async function savePublishedPlanning(
  db: Queryable,
  user: SessionUser,
  snapshots: PlanningEventSnapshot[],
  publishedAt = new Date().toISOString(),
  previouslyPublishedKeys: ReadonlySet<string> = new Set(),
): Promise<PublishedPlanningPayload> {
  const payload = buildPublishedPlanningPayload(user, snapshots, publishedAt, previouslyPublishedKeys);
  await savePlanningRecord(db, {
    id: recordId(user.clubId),
    kind: 'published-planning',
    clubId: user.clubId,
    ownerUserId: user.id,
    payload,
  });
  return payload;
}

/**
 * Remplace un seul événement dans le snapshot publié déjà en place, sans attendre la
 * prochaine "Publier tout". Réservé aux exceptions opérationnelles explicitement validées
 * par un admin (ex. remplacement d'affectation) dont le texte annonce un effet immédiat :
 * pour toute autre modification structurelle, seule la publication globale fait foi. Ne
 * fait rien si le club n'a encore jamais publié de planning global (rien à corriger), ou
 * si cet événement précis n'est pas dans le snapshot publié (ex. jamais publié).
 */
export async function patchPublishedPlanningEvent(
  db: Queryable,
  clubId: string,
  liveSnapshot: PlanningEventSnapshot,
): Promise<void> {
  await ensurePlanningSupportTables(db);
  const id = recordId(clubId);
  const key = eventKey(liveSnapshot);

  // Verrouille la ligne pour toute la durée du read-modify-write : une publication globale
  // concurrente (INSERT ... ON DUPLICATE KEY UPDATE sur le même id) est bloquée par InnoDB
  // jusqu'au commit de cette transaction, ce qui évite d'écraser une republication récente.
  await db.transaction(async (manager) => {
    const rows = (await manager.query(
      `SELECT payload, owner_user_id AS ownerUserId FROM planning_records WHERE id = ? AND club_id = ? FOR UPDATE`,
      [id, clubId],
    )) as { payload: string; ownerUserId: number | null }[];
    const row = rows[0];
    if (!row) return;

    let current: PublishedPlanningPayload;
    try {
      current = JSON.parse(row.payload) as PublishedPlanningPayload;
    } catch {
      return;
    }
    if (current?.schemaVersion !== 1 || !Array.isArray(current.events)) return;
    if (!current.events.some((event) => eventKey(event) === key)) return;

    const events = current.events.map((event) => (eventKey(event) === key ? asPublished(liveSnapshot, true) : event));
    await manager.query(
      `INSERT INTO planning_records
        (id, club_id, kind, event_type, event_id, owner_user_id, person_type, person_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        kind = VALUES(kind), event_type = VALUES(event_type), event_id = VALUES(event_id),
        owner_user_id = VALUES(owner_user_id), person_type = VALUES(person_type), person_id = VALUES(person_id),
        payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP(6)`,
      [
        id,
        clubId,
        'published-planning',
        null,
        null,
        current.publishedByUserId ?? row.ownerUserId ?? null,
        null,
        null,
        JSON.stringify({ ...current, events }),
      ],
    );
  });
}
