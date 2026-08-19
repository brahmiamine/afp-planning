import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { extractMinutes, dateKeyToComparable } from './officiel-availability';

export const DEFAULT_EVENT_DURATION_MINUTES = 90;

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

function toInstant(date: string, time?: string): number | null {
  const dateComparable = dateKeyToComparable(date);
  if (dateComparable === null) {
    return null;
  }
  const minutes = extractMinutes(time) ?? 0;
  return dateComparable * 1440 + minutes;
}

function getEventLocationKey(event: Event): string {
  if (isMatchEvent(event)) {
    const stadium = event.details?.stadium?.trim();
    return stadium ? stadium.toLowerCase() : '';
  }
  return (event.lieu || '').trim().toLowerCase();
}

function getEventTitle(event: Event): string {
  if (isMatchEvent(event)) {
    return `${event.localTeam} vs ${event.awayTeam}`;
  }
  if (event.type === 'entrainement') {
    return 'Entraînement';
  }
  if (event.type === 'plateau') {
    return 'Plateau';
  }
  return 'Événement';
}

function getEventAssignedNames(
  event: Event,
  allExtras: Record<string, MatchExtras>,
  role: AssignmentRole,
): string[] {
  if (isMatchEvent(event)) {
    const extras = event.id ? allExtras[event.id] : undefined;
    if (!extras) {
      return [];
    }
    const list =
      role === 'arbitre'
        ? extras.arbitreTouche
        : role === 'encadrant'
          ? extras.contactEncadrants
          : extras.contactAccompagnateur;
    return (list || []).map((c) => c.nom.toLowerCase().trim());
  }

  if (role !== 'encadrant') {
    return [];
  }
  return (event.encadrants || []).map((c) => c.nom.toLowerCase().trim());
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export function checkPersonConflict(
  personNom: string,
  // Unused: a person can't be in two places at once regardless of role, so conflicts
  // are checked across all roles at the other event, not just this same one.
  _role: AssignmentRole,
  targetEvent: Event,
  allEventsList: Event[],
  allExtras: Record<string, MatchExtras>,
): ConflictResult {
  const targetInstant = toInstant(targetEvent.date, targetEvent.time);
  if (targetInstant === null) {
    return { conflict: false };
  }

  const normalizedName = normalize(personNom);

  for (const other of allEventsList) {
    if (other.id && targetEvent.id && other.id === targetEvent.id) {
      continue;
    }

    const otherInstant = toInstant(other.date, other.time);
    if (otherInstant === null) {
      continue;
    }

    if (Math.abs(otherInstant - targetInstant) >= DEFAULT_EVENT_DURATION_MINUTES) {
      continue;
    }

    const assignedRoles: AssignmentRole[] = isMatchEvent(other)
      ? ['arbitre', 'encadrant', 'accompagnateur']
      : ['encadrant'];

    for (const otherRole of assignedRoles) {
      const names = getEventAssignedNames(other, allExtras, otherRole);
      if (names.includes(normalizedName)) {
        return {
          conflict: true,
          conflictingEvent: other,
          message: `${personNom} est déjà affecté(e) à "${getEventTitle(other)}" le ${other.date} à ${other.time} (moins de ${DEFAULT_EVENT_DURATION_MINUTES} min d'écart).`,
        };
      }
    }
  }

  return { conflict: false };
}

export function checkLocationConflict(targetEvent: Event, allEventsList: Event[]): ConflictResult {
  const locationKey = getEventLocationKey(targetEvent);
  if (!locationKey) {
    return { conflict: false };
  }

  const targetInstant = toInstant(targetEvent.date, targetEvent.time);
  if (targetInstant === null) {
    return { conflict: false };
  }

  for (const other of allEventsList) {
    if (other.id && targetEvent.id && other.id === targetEvent.id) {
      continue;
    }

    if (getEventLocationKey(other) !== locationKey) {
      continue;
    }

    const otherInstant = toInstant(other.date, other.time);
    if (otherInstant === null) {
      continue;
    }

    if (Math.abs(otherInstant - targetInstant) >= DEFAULT_EVENT_DURATION_MINUTES) {
      continue;
    }

    return {
      conflict: true,
      conflictingEvent: other,
      message: `Le lieu est déjà utilisé par "${getEventTitle(other)}" le ${other.date} à ${other.time} (moins de ${DEFAULT_EVENT_DURATION_MINUTES} min d'écart).`,
    };
  }

  return { conflict: false };
}
