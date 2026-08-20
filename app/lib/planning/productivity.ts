import type { AssignmentContact } from '@/types/match';

const UNSAFE_TEMPLATE_KEYS = new Set([
  'id',
  'date',
  'seriesId',
  'planningStatus',
  'publishedAt',
  'publishedByUserId',
  'modifiedAfterPublishAt',
  'cancelledAt',
  'cancelledByUserId',
  'cancellationReason',
]);

function parsePlanningDate(value: string): { date: Date; style: 'fr' | 'iso' } | null {
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (fr) {
    const date = new Date(Date.UTC(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])));
    return Number.isNaN(date.getTime()) ? null : { date, style: 'fr' };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? null : { date, style: 'iso' };
  }
  return null;
}

export function shiftPlanningDate(value: string, offsetDays: number): string | null {
  if (!Number.isInteger(offsetDays) || Math.abs(offsetDays) > 3660) return null;
  const parsed = parsePlanningDate(value);
  if (!parsed) return null;
  parsed.date.setUTCDate(parsed.date.getUTCDate() + offsetDays);
  const year = parsed.date.getUTCFullYear();
  const month = String(parsed.date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.date.getUTCDate()).padStart(2, '0');
  return parsed.style === 'fr' ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}

export function resetAssignmentForDuplicate(contact: AssignmentContact): AssignmentContact {
  return {
    nom: contact.nom,
    numero: contact.numero,
    personId: contact.personId,
    personType: contact.personType,
    status: 'pending',
    assignedAt: new Date().toISOString(),
    respondedAt: undefined,
    declineReason: undefined,
    declineComment: undefined,
    attendanceStatus: 'unknown',
    attendanceUpdatedAt: undefined,
    remindersSent: [],
    lastReminderAt: undefined,
    reminderCount: 0,
  };
}

export function stripUnsafeTemplateFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (UNSAFE_TEMPLATE_KEYS.has(key)) continue;
    if (key === 'encadrants' || key === 'encadrant' || key === 'staff') continue;
    result[key] = value;
  }
  return result as Partial<T>;
}

export interface BulkPlanningItem {
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
  eventId: string;
}

export function normalizeBulkItems(value: unknown, max = 100): BulkPlanningItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const items: BulkPlanningItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const eventType = item.eventType;
    const eventId = typeof item.eventId === 'string' ? item.eventId.trim() : '';
    if ((eventType !== 'officiel' && eventType !== 'amical' && eventType !== 'entrainement' && eventType !== 'plateau') || !eventId) return null;
    const key = `${eventType}:${eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ eventType, eventId });
  }
  return items;
}
