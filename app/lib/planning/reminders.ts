import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import { notifyContact } from '@/lib/notifications/service';
import {
  getPlanningEventSnapshot,
  listPlanningEventSnapshots,
  saveRoleAssignments,
  type PlanningEventSnapshot,
  type PlanningRole,
} from './event-store';
import {
  applyReminderStage,
  assignmentStatus,
  eventStartTimestamp,
  isVisiblePublicationStatus,
  nextReminderStage,
} from './p0-rules';
import { readAppSettings } from '@/lib/settings-store';
import { getCurrentClubId } from '@/lib/auth/club-context';
import {
  listPublishedPlanningEventSnapshots,
  overlayPublishedPlanningOperationalState,
} from './published-planning';

export interface ReminderRunResult {
  inspectedEvents: number;
  remindersSent: number;
  updatedAssignments: number;
}

function roleLabel(role: PlanningRole): string {
  if (role === 'arbitre') return 'arbitre';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

function reminderMessage(snapshot: PlanningEventSnapshot, role: PlanningRole): string {
  return `${snapshot.title} · ${snapshot.date} à ${snapshot.time}. Votre affectation comme ${roleLabel(role)} attend toujours une réponse. Merci de l’accepter ou de la refuser dans votre espace.`;
}

function sameContact(left: AssignmentContact, right: AssignmentContact): boolean {
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

async function persistReminderState(
  db: DataSource,
  source: PlanningEventSnapshot,
  role: PlanningRole,
  updatedPublishedContacts: AssignmentContact[],
): Promise<boolean> {
  const live = await getPlanningEventSnapshot(db, source.eventType, source.eventId);
  if (!live) return false;

  let changed = false;
  const merged = live.assignments[role].map((liveContact) => {
    const updated = updatedPublishedContacts.find((candidate) => sameContact(candidate, liveContact));
    if (!updated) return liveContact;
    changed = true;
    return {
      ...liveContact,
      remindersSent: updated.remindersSent,
      lastReminderAt: updated.lastReminderAt,
      reminderCount: updated.reminderCount,
    };
  });

  if (!changed) return false;
  await saveRoleAssignments(db, live, role, merged);
  return true;
}

export async function runDuePlanningReminders(
  db: DataSource,
  now = Date.now(),
): Promise<ReminderRunResult> {
  const liveSnapshots = await listPlanningEventSnapshots(db);
  const publishedSnapshots = await listPublishedPlanningEventSnapshots(db);
  const snapshots = publishedSnapshots
    ? overlayPublishedPlanningOperationalState(publishedSnapshots, liveSnapshots)
    : liveSnapshots;
  const { timeZone } = await readAppSettings(db, getCurrentClubId());
  let remindersSent = 0;
  let updatedAssignments = 0;

  for (const snapshot of snapshots) {
    // Jamais de relance sur un événement annulé ou jamais publié, quelle que soit la source :
    // un événement annulé reste volontairement dans le snapshot publié pendant la fenêtre de
    // publication, et ne doit pas relancer les personnes affectées pour autant (issue #70).
    if (!isVisiblePublicationStatus(snapshot.planningStatus)) continue;
    const eventStart = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
    if (eventStart === null || eventStart <= now) continue;

    for (const role of ['arbitre', 'encadrant', 'accompagnateur'] as const) {
      const current = snapshot.assignments[role];
      if (!current.length) continue;
      let changed = false;
      const next: AssignmentContact[] = [];

      for (const contact of current) {
        const stage = nextReminderStage(contact, eventStart, now);
        if (!stage) {
          next.push(contact);
          continue;
        }

        await notifyContact(db, contact, {
          type: `assignment-reminder-${stage}`,
          title: 'Rappel · affectation en attente',
          message: reminderMessage(snapshot, role),
          eventType: snapshot.eventType,
          eventId: snapshot.eventId,
        });
        next.push(applyReminderStage(contact, stage, new Date(now).toISOString()));
        remindersSent += 1;
        changed = true;
      }

      if (changed) {
        if (await persistReminderState(db, snapshot, role, next)) {
          updatedAssignments += 1;
        }
      }
    }
  }

  return {
    inspectedEvents: snapshots.length,
    remindersSent,
    updatedAssignments,
  };
}

export async function sendManualAssignmentReminder(
  db: DataSource,
  snapshot: PlanningEventSnapshot,
  role: PlanningRole,
  personId?: number | null,
): Promise<number> {
  if (!isVisiblePublicationStatus(snapshot.planningStatus)) return 0;
  const current = snapshot.assignments[role];
  let sent = 0;
  let changed = false;
  const now = new Date().toISOString();

  const next = await Promise.all(current.map(async (contact) => {
    const matchesPerson = personId === null || personId === undefined || contact.personId === personId;
    if (!matchesPerson || assignmentStatus(contact) !== 'pending') return contact;

    await notifyContact(db, contact, {
      type: 'assignment-reminder-manual',
      title: 'Rappel · affectation en attente',
      message: reminderMessage(snapshot, role),
      eventType: snapshot.eventType,
      eventId: snapshot.eventId,
    });
    sent += 1;
    changed = true;
    return {
      ...contact,
      lastReminderAt: now,
      reminderCount: (contact.reminderCount ?? 0) + 1,
    };
  }));

  if (changed) await persistReminderState(db, snapshot, role, next);
  return sent;
}
