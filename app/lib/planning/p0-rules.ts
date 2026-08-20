import type {
  AssignmentContact,
  AssignmentStatus,
  AttendanceStatus,
  PlanningPublicationStatus,
  ReminderStage,
} from '@/types/match';
import { extractMinutes, normalizeDateValue } from '@/lib/utils/officiel-availability';

export const LEGACY_PUBLICATION_STATUS: PlanningPublicationStatus = 'published';

export function normalizePlanningStatus(value: unknown): PlanningPublicationStatus {
  if (value === 'draft' || value === 'published' || value === 'modified' || value === 'cancelled') {
    return value;
  }
  return LEGACY_PUBLICATION_STATUS;
}

export function isVisiblePublicationStatus(status: PlanningPublicationStatus): boolean {
  return status === 'published' || status === 'modified';
}

export function assignmentStatus(contact: AssignmentContact): AssignmentStatus {
  return contact.status === 'accepted' || contact.status === 'declined' ? contact.status : 'pending';
}

export function attendanceStatus(contact: AssignmentContact): AttendanceStatus {
  if (
    contact.attendanceStatus === 'present'
    || contact.attendanceStatus === 'excused'
    || contact.attendanceStatus === 'absent'
    || contact.attendanceStatus === 'replaced'
  ) {
    return contact.attendanceStatus;
  }
  return 'unknown';
}

export function activeContacts(contacts: AssignmentContact[] | undefined): AssignmentContact[] {
  return (contacts ?? []).filter((contact) => assignmentStatus(contact) !== 'declined');
}

export function needsReplacement(contacts: AssignmentContact[] | undefined): boolean {
  return Boolean(contacts?.length) && activeContacts(contacts).length === 0;
}

export function hasCoveredRole(contacts: AssignmentContact[] | undefined): boolean {
  return activeContacts(contacts).length > 0;
}

function timeZoneOffset(timestamp: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second),
    );
    return displayedAsUtc - timestamp;
  } catch {
    return 0;
  }
}

export function eventStartTimestamp(date: string, time: string, timeZone = 'UTC'): number | null {
  const normalized = normalizeDateValue(date);
  if (!normalized) return null;
  const [dayRaw, monthRaw, yearRaw] = normalized.split('/');
  const day = Number.parseInt(dayRaw ?? '', 10);
  const month = Number.parseInt(monthRaw ?? '', 10);
  const year = Number.parseInt(yearRaw ?? '', 10);
  const minutes = extractMinutes(time);
  if (!day || !month || !year || minutes === null) return null;
  const localAsUtc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let result = localAsUtc - timeZoneOffset(localAsUtc, timeZone);
  result = localAsUtc - timeZoneOffset(result, timeZone);
  return result;
}

export function eventEndTimestamp(date: string, time: string, durationMinutes: number, timeZone = 'UTC'): number | null {
  const start = eventStartTimestamp(date, time, timeZone);
  return start === null ? null : start + durationMinutes * 60_000;
}

export function isAttendancePending(
  contact: AssignmentContact,
  eventEnd: number | null,
  now = Date.now(),
): boolean {
  if (eventEnd === null || eventEnd >= now) return false;
  if (assignmentStatus(contact) === 'declined') return false;
  return attendanceStatus(contact) === 'unknown';
}

export function nextReminderStage(
  contact: AssignmentContact,
  eventStart: number | null,
  now = Date.now(),
): ReminderStage | null {
  if (assignmentStatus(contact) !== 'pending' || eventStart === null || eventStart <= now) return null;

  const sent = new Set(contact.remindersSent ?? []);
  const remainingHours = (eventStart - now) / 3_600_000;

  if (remainingHours <= 24 && !sent.has('24h')) return '24h';
  if (remainingHours <= 72 && !sent.has('72h')) return '72h';

  const assignedAt = contact.assignedAt ? new Date(contact.assignedAt).getTime() : Number.NaN;
  if (
    Number.isFinite(assignedAt)
    && now - assignedAt >= 48 * 3_600_000
    && !sent.has('awaiting-48h')
  ) {
    return 'awaiting-48h';
  }

  return null;
}

export function applyReminderStage(
  contact: AssignmentContact,
  stage: ReminderStage,
  at = new Date().toISOString(),
): AssignmentContact {
  const reminders = Array.from(new Set([...(contact.remindersSent ?? []), stage]));
  return {
    ...contact,
    remindersSent: reminders,
    lastReminderAt: at,
    reminderCount: (contact.reminderCount ?? 0) + 1,
  };
}

export function markAttendance(
  contact: AssignmentContact,
  status: Exclude<AttendanceStatus, 'unknown'>,
  at = new Date().toISOString(),
): AssignmentContact {
  return {
    ...contact,
    attendanceStatus: status,
    attendanceUpdatedAt: at,
  };
}
