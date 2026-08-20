import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import { notifyContact } from '@/lib/notifications/service';
import {
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

export async function runDuePlanningReminders(
  db: DataSource,
  now = Date.now(),
): Promise<ReminderRunResult> {
  const snapshots = await listPlanningEventSnapshots(db);
  let remindersSent = 0;
  let updatedAssignments = 0;

  for (const snapshot of snapshots) {
    if (!isVisiblePublicationStatus(snapshot.planningStatus)) continue;
    const eventStart = eventStartTimestamp(snapshot.date, snapshot.time);
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
        await saveRoleAssignments(db, snapshot, role, next);
        updatedAssignments += 1;
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

  if (changed) await saveRoleAssignments(db, snapshot, role, next);
  return sent;
}
