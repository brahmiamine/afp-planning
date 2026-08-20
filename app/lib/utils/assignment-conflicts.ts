import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { extractMinutes, normalizeDateValue } from './officiel-availability';

export const DEFAULT_EVENT_DURATION_MINUTES = 90;
export const DEFAULT_TRAVEL_BUFFER_MINUTES = 30;

export type Event = Match | Entrainement | Plateau;
export type AssignmentRole = 'arbitre' | 'encadrant' | 'accompagnateur';

export interface ConflictResult {
  conflict: boolean;
  conflictingEvent?: Event;
  message?: string;
}

function isMatchEvent(event: Event): event is Match {
  return 'localTeam' in event || 'competition' in event;
}

function toStartMinute(date: string, time?: string): number | null {
  const normalized = normalizeDateValue(date);
  if (!normalized) return null;
  const [dayRaw, monthRaw, yearRaw] = normalized.split('/');
  const day = Number.parseInt(dayRaw ?? '', 10);
  const month = Number.parseInt(monthRaw ?? '', 10);
  const year = Number.parseInt(yearRaw ?? '', 10);
  const minutes = extractMinutes(time) ?? 0;
  if (!day || !month || !year) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 60_000) + minutes;
}

export function getEventDurationMinutes(event: Event): number {
  const raw = event.durationMinutes;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 15 && raw <= 12 * 60) {
    return Math.round(raw);
  }
  return DEFAULT_EVENT_DURATION_MINUTES;
}

function getEventLocationKey(event: Event): string {
  if (isMatchEvent(event)) {
    const stadium = event.details?.stadium?.trim();
    return stadium ? stadium.toLowerCase() : '';
  }
  return (event.lieu || '').trim().toLowerCase();
}

function getEventTitle(event: Event): string {
  if (isMatchEvent(event)) return `${event.localTeam} vs ${event.awayTeam}`;
  if (event.type === 'entrainement') return 'Entraînement';
  if (event.type === 'plateau') return 'Plateau';
  return 'Événement';
}

function getEventAssignedNames(
  event: Event,
  allExtras: Record<string, MatchExtras>,
  role: AssignmentRole,
): string[] {
  if (isMatchEvent(event)) {
    const extras = event.id ? allExtras[event.id] : undefined;
    if (!extras) return [];
    const list = role === 'arbitre'
      ? extras.arbitreTouche
      : role === 'encadrant'
        ? extras.contactEncadrants
        : extras.contactAccompagnateur;
    return (list || []).map((contact) => contact.nom.toLowerCase().trim());
  }

  if (role !== 'encadrant') return [];
  return (event.encadrants || []).map((contact) => contact.nom.toLowerCase().trim());
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function intervalsConflict(
  firstStart: number,
  firstDuration: number,
  secondStart: number,
  secondDuration: number,
  bufferMinutes: number,
): boolean {
  const firstEnd = firstStart + firstDuration;
  const secondEnd = secondStart + secondDuration;
  return firstStart < secondEnd + bufferMinutes && secondStart < firstEnd + bufferMinutes;
}

export function checkPersonConflict(
  personNom: string,
  _role: AssignmentRole,
  targetEvent: Event,
  allEventsList: Event[],
  allExtras: Record<string, MatchExtras>,
): ConflictResult {
  const targetStart = toStartMinute(targetEvent.date, targetEvent.time);
  if (targetStart === null) return { conflict: false };
  const targetDuration = getEventDurationMinutes(targetEvent);
  const normalizedName = normalize(personNom);

  for (const other of allEventsList) {
    if (other.id && targetEvent.id && other.id === targetEvent.id) continue;
    const otherStart = toStartMinute(other.date, other.time);
    if (otherStart === null) continue;

    if (!intervalsConflict(
      targetStart,
      targetDuration,
      otherStart,
      getEventDurationMinutes(other),
      DEFAULT_TRAVEL_BUFFER_MINUTES,
    )) continue;

    const assignedRoles: AssignmentRole[] = isMatchEvent(other)
      ? ['arbitre', 'encadrant', 'accompagnateur']
      : ['encadrant'];

    for (const otherRole of assignedRoles) {
      if (getEventAssignedNames(other, allExtras, otherRole).includes(normalizedName)) {
        return {
          conflict: true,
          conflictingEvent: other,
          message: `${personNom} est déjà affecté(e) à « ${getEventTitle(other)} ». La durée des événements et ${DEFAULT_TRAVEL_BUFFER_MINUTES} min de déplacement se chevauchent.`,
        };
      }
    }
  }

  return { conflict: false };
}

export function checkLocationConflict(targetEvent: Event, allEventsList: Event[]): ConflictResult {
  const locationKey = getEventLocationKey(targetEvent);
  if (!locationKey) return { conflict: false };
  const targetStart = toStartMinute(targetEvent.date, targetEvent.time);
  if (targetStart === null) return { conflict: false };

  for (const other of allEventsList) {
    if (other.id && targetEvent.id && other.id === targetEvent.id) continue;
    if (getEventLocationKey(other) !== locationKey) continue;
    const otherStart = toStartMinute(other.date, other.time);
    if (otherStart === null) continue;

    if (intervalsConflict(
      targetStart,
      getEventDurationMinutes(targetEvent),
      otherStart,
      getEventDurationMinutes(other),
      0,
    )) {
      return {
        conflict: true,
        conflictingEvent: other,
        message: `Le lieu est déjà occupé par « ${getEventTitle(other)} » pendant ce créneau.`,
      };
    }
  }

  return { conflict: false };
}
