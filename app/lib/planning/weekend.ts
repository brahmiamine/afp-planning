import type { DataSource } from 'typeorm';
import { listPlanningEventSnapshots, type PlanningEventSnapshot, type PlanningRole } from './event-store';
import {
  assignmentStatus,
  eventStartTimestamp,
  hasCoveredRole,
  needsReplacement,
  normalizePlanningStatus,
} from './p0-rules';

export interface WeekendPlanningItem {
  eventId: string;
  eventType: PlanningEventSnapshot['eventType'];
  title: string;
  date: string;
  time: string;
  location: string | null;
  planningStatus: PlanningEventSnapshot['planningStatus'];
  readiness: 'ready' | 'attention';
  missingRoles: PlanningRole[];
  replacementRoles: PlanningRole[];
  pending: number;
  declined: number;
}

export interface WeekendPlanningData {
  start: string;
  end: string;
  total: number;
  ready: number;
  attention: number;
  items: WeekendPlanningItem[];
}

function requiredRoles(snapshot: PlanningEventSnapshot): PlanningRole[] {
  return snapshot.eventType === 'officiel' || snapshot.eventType === 'amical'
    ? ['arbitre', 'encadrant', 'accompagnateur']
    : ['encadrant'];
}

export function weekendWindow(now = Date.now()): { start: number; end: number } {
  const current = new Date(now);
  const day = current.getUTCDay();
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day;
  const start = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + daysUntilSaturday,
    0,
    0,
    0,
    0,
  );
  return { start, end: start + 2 * 24 * 60 * 60_000 - 1 };
}

export function buildWeekendPlanning(
  snapshots: PlanningEventSnapshot[],
  now = Date.now(),
): WeekendPlanningData {
  const window = weekendWindow(now);
  const items: WeekendPlanningItem[] = [];

  for (const snapshot of snapshots) {
    if (normalizePlanningStatus(snapshot.planningStatus) === 'cancelled') continue;
    const start = eventStartTimestamp(snapshot.date, snapshot.time);
    if (start === null || start < window.start || start > window.end) continue;

    const missingRoles: PlanningRole[] = [];
    const replacementRoles: PlanningRole[] = [];
    let pending = 0;
    let declined = 0;

    for (const role of requiredRoles(snapshot)) {
      const contacts = snapshot.assignments[role] ?? [];
      if (!contacts.length || !hasCoveredRole(contacts)) missingRoles.push(role);
      if (needsReplacement(contacts)) replacementRoles.push(role);
      for (const contact of contacts) {
        const status = assignmentStatus(contact);
        if (status === 'pending') pending += 1;
        if (status === 'declined') declined += 1;
      }
    }

    const readiness = snapshot.planningStatus === 'published'
      && missingRoles.length === 0
      && replacementRoles.length === 0
      && pending === 0
      && declined === 0
      ? 'ready'
      : 'attention';

    items.push({
      eventId: snapshot.eventId,
      eventType: snapshot.eventType,
      title: snapshot.title,
      date: snapshot.date,
      time: snapshot.time,
      location: snapshot.location,
      planningStatus: snapshot.planningStatus,
      readiness,
      missingRoles,
      replacementRoles,
      pending,
      declined,
    });
  }

  items.sort((a, b) => (eventStartTimestamp(a.date, a.time) ?? 0) - (eventStartTimestamp(b.date, b.time) ?? 0));
  return {
    start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(),
    total: items.length,
    ready: items.filter((item) => item.readiness === 'ready').length,
    attention: items.filter((item) => item.readiness === 'attention').length,
    items,
  };
}

export async function getWeekendPlanning(db: DataSource, now = Date.now()): Promise<WeekendPlanningData> {
  return buildWeekendPlanning(await listPlanningEventSnapshots(db), now);
}
