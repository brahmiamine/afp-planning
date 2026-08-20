import type { DataSource } from 'typeorm';
import { eventEndTimestamp, eventStartTimestamp } from './p0-rules';
import { getPlanningEventSnapshot, type PlanningEventType, type PlanningEventSnapshot } from './event-store';
import { getPlanningRecord, listPlanningRecords } from './records';

export type PlanningResourceType = 'terrain' | 'vestiaire' | 'vehicule' | 'materiel' | 'autre';

export interface PlanningResourcePayload {
  name: string;
  type: PlanningResourceType;
  description: string | null;
  exclusive: boolean;
  capacity: number | null;
  location: string | null;
  lat: number | null;
  lon: number | null;
  active: boolean;
}

export interface ResourceBookingPayload {
  resourceId: string;
  eventType: PlanningEventType;
  eventId: string;
  quantity: number;
  note: string | null;
  createdByUserId: number;
}

export interface EventInterval {
  date: string;
  time: string;
  durationMinutes: number;
}

const RESOURCE_TYPES: PlanningResourceType[] = ['terrain', 'vestiaire', 'vehicule', 'materiel', 'autre'];

function optionalCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function normalizePlanningResource(value: unknown): PlanningResourcePayload | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 160) : '';
  if (!name || !RESOURCE_TYPES.includes(raw.type as PlanningResourceType)) return null;
  const capacityRaw = raw.capacity === null || raw.capacity === undefined || raw.capacity === '' ? null : Number(raw.capacity);
  const capacity = capacityRaw !== null && Number.isInteger(capacityRaw) && capacityRaw > 0 && capacityRaw <= 10000 ? capacityRaw : null;
  return {
    name,
    type: raw.type as PlanningResourceType,
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 1000) || null : null,
    exclusive: raw.exclusive !== false,
    capacity,
    location: typeof raw.location === 'string' ? raw.location.trim().slice(0, 300) || null : null,
    lat: optionalCoordinate(raw.lat, -90, 90),
    lon: optionalCoordinate(raw.lon, -180, 180),
    active: raw.active !== false,
  };
}

export function bookingIntervalsOverlap(first: EventInterval, second: EventInterval): boolean {
  const firstStart = eventStartTimestamp(first.date, first.time);
  const firstEnd = eventEndTimestamp(first.date, first.time, first.durationMinutes);
  const secondStart = eventStartTimestamp(second.date, second.time);
  const secondEnd = eventEndTimestamp(second.date, second.time, second.durationMinutes);
  if (firstStart === null || firstEnd === null || secondStart === null || secondEnd === null) return false;
  return firstStart < secondEnd && secondStart < firstEnd;
}

export async function findResourceBookingConflicts(
  db: DataSource,
  resourceId: string,
  target: PlanningEventSnapshot,
  excludeRecordId?: string,
): Promise<Array<{ bookingId: string; eventType: PlanningEventType; eventId: string; title: string }>> {
  const resourceRecord = await getPlanningRecord<PlanningResourcePayload>(db, resourceId);
  if (!resourceRecord || resourceRecord.kind !== 'resource' || !resourceRecord.payload.exclusive) return [];
  const bookings = await listPlanningRecords<ResourceBookingPayload>(db, { kind: 'resource-booking' }, 1000);
  const conflicts: Array<{ bookingId: string; eventType: PlanningEventType; eventId: string; title: string }> = [];
  for (const booking of bookings) {
    if (booking.id === excludeRecordId || booking.payload.resourceId !== resourceId) continue;
    if (booking.payload.eventType === target.eventType && booking.payload.eventId === target.eventId) continue;
    const other = await getPlanningEventSnapshot(db, booking.payload.eventType, booking.payload.eventId);
    if (!other) continue;
    if (bookingIntervalsOverlap(target, other)) {
      conflicts.push({ bookingId: booking.id, eventType: other.eventType, eventId: other.eventId, title: other.title });
    }
  }
  return conflicts;
}

export async function eventCoordinatesFromResources(
  db: DataSource,
  eventType: PlanningEventType,
  eventId: string,
): Promise<{ lat: number; lon: number; resourceName: string } | null> {
  const bookings = await listPlanningRecords<ResourceBookingPayload>(db, { kind: 'resource-booking', eventType, eventId }, 100);
  for (const booking of bookings) {
    const resource = await getPlanningRecord<PlanningResourcePayload>(db, booking.payload.resourceId);
    if (!resource || resource.kind !== 'resource') continue;
    if (resource.payload.lat !== null && resource.payload.lon !== null) {
      return { lat: resource.payload.lat, lon: resource.payload.lon, resourceName: resource.payload.name };
    }
  }
  return null;
}
