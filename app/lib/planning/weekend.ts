import type { DataSource } from 'typeorm';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import { listPlanningEventSnapshots, type PlanningEventSnapshot, type PlanningRole } from './event-store';
import {
  assignmentStatus,
  eventStartTimestamp,
  hasCoveredRole,
  needsReplacement,
  normalizePlanningStatus,
} from './p0-rules';
import { zonedDateParts, zonedWeekday } from './planning-time';
import {
  DEFAULT_PUBLICATION_ROLE_REQUIREMENTS,
  requiredRolesForEvent,
  type PublicationRoleRequirements,
} from './validation';

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

/**
 * Fenêtre samedi 00:00 → lundi 00:00 **dans le fuseau du club** (issue #45) : un match
 * du samedi ou du dimanche doit être classé sur le bon week-end quelle que soit l'heure
 * UTC sous-jacente.
 */
export function weekendWindow(now = Date.now(), timeZone = 'UTC'): { start: number; end: number } {
  const weekday = zonedWeekday(now, timeZone);
  const daysUntilSaturday = weekday === 6 ? 0 : weekday === 0 ? -1 : 6 - weekday;
  const { year, month, day } = zonedDateParts(now, timeZone);
  const format = (value: Date) => `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
  const saturday = new Date(Date.UTC(year, month - 1, day + daysUntilSaturday));
  const monday = new Date(Date.UTC(year, month - 1, day + daysUntilSaturday + 2));
  const start = eventStartTimestamp(format(saturday), '00:00', timeZone);
  const mondayStart = eventStartTimestamp(format(monday), '00:00', timeZone);
  if (start === null || mondayStart === null) {
    const fallback = now - ((weekday === 6 ? 0 : weekday + 1) * 0);
    return { start: fallback, end: fallback + 2 * 24 * 60 * 60_000 - 1 };
  }
  return { start, end: mondayStart - 1 };
}

export function buildWeekendPlanning(
  snapshots: PlanningEventSnapshot[],
  requirements: PublicationRoleRequirements = DEFAULT_PUBLICATION_ROLE_REQUIREMENTS,
  now = Date.now(),
  timeZone = 'UTC',
): WeekendPlanningData {
  const window = weekendWindow(now, timeZone);
  const items: WeekendPlanningItem[] = [];

  for (const snapshot of snapshots) {
    if (normalizePlanningStatus(snapshot.planningStatus) === 'cancelled') continue;
    const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
    if (start === null || start < window.start || start > window.end) continue;

    const missingRoles: PlanningRole[] = [];
    const replacementRoles: PlanningRole[] = [];
    let pending = 0;
    let declined = 0;

    for (const role of requiredRolesForEvent(snapshot, requirements)) {
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

  items.sort((a, b) => (eventStartTimestamp(a.date, a.time, timeZone) ?? 0) - (eventStartTimestamp(b.date, b.time, timeZone) ?? 0));
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
  const clubId = getCurrentClubId();
  const [settings, snapshots] = await Promise.all([
    readAppSettings(db, clubId),
    listPlanningEventSnapshots(db),
  ]);
  const requirements: PublicationRoleRequirements = {
    arbitre: settings.features.requireArbitreForPublication,
    encadrant: settings.features.requireEncadrantForPublication,
    accompagnateur: settings.features.requireAccompagnateurForPublication,
  };
  return buildWeekendPlanning(snapshots, requirements, now, settings.timeZone);
}
