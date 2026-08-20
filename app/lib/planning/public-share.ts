import { createHash, randomBytes } from 'node:crypto';
import type { PlanningEventSnapshot, PlanningEventType } from './event-store';

export interface PublicPlanningItem {
  eventType: PlanningEventType;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location: string | null;
  category: string | null;
}

export interface PublicShareScope {
  eventTypes: PlanningEventType[];
  fromDate: string | null;
  toDate: string | null;
}

export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function eventCategory(snapshot: PlanningEventSnapshot): string | null {
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    return 'categorie' in snapshot.event && typeof snapshot.event.categorie === 'string'
      ? snapshot.event.categorie
      : null;
  }
  if (snapshot.eventType === 'entrainement') {
    return 'categorie' in snapshot.event && typeof snapshot.event.categorie === 'string'
      ? snapshot.event.categorie
      : null;
  }
  return 'categories' in snapshot.event && Array.isArray(snapshot.event.categories)
    ? snapshot.event.categories.join(', ')
    : null;
}

export function toPublicPlanningItem(snapshot: PlanningEventSnapshot): PublicPlanningItem {
  return {
    eventType: snapshot.eventType,
    title: snapshot.title,
    date: snapshot.date,
    time: snapshot.time,
    durationMinutes: snapshot.durationMinutes,
    location: snapshot.location,
    category: eventCategory(snapshot),
  };
}

export function isSnapshotInShareScope(snapshot: PlanningEventSnapshot, scope: PublicShareScope): boolean {
  if (scope.eventTypes.length && !scope.eventTypes.includes(snapshot.eventType)) return false;
  const [day, month, year] = snapshot.date.split('/').map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return false;
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (scope.fromDate && isoDate < scope.fromDate) return false;
  if (scope.toDate && isoDate > scope.toDate) return false;
  return true;
}
