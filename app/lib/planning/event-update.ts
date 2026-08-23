import type { Entrainement, Match, MatchDetails, MatchStaff, Plateau } from '@/types/match';
import type { PlanningEventType } from './event-store';

type PlanningEvent = Match | Entrainement | Plateau;

type EventUpdateInput = Record<string, unknown>;

function stringValue(value: unknown, fallback: string, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;
}

function optionalStringValue(value: unknown, fallback: string | undefined, maxLength = 500): string | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function durationValue(value: unknown, fallback: number | undefined, defaultValue: number): number {
  if (value === undefined) return fallback ?? defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback ?? defaultValue;
  return Math.min(720, Math.max(1, Math.round(parsed)));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function matchDetails(
  current: MatchDetails | null | undefined,
  input: unknown,
  date: string,
  time: string,
  competition: string,
): MatchDetails | null {
  const patch = recordValue(input);
  const shouldExist = current !== null && current !== undefined
    || Object.keys(patch).length > 0;
  if (!shouldExist) return null;

  return {
    stadium: stringValue(patch.stadium, current?.stadium ?? '', 250),
    dateTime: `${date} - ${time}`,
    competition,
    address: stringValue(patch.address, current?.address ?? '', 500),
    terrainType: stringValue(patch.terrainType, current?.terrainType ?? '', 120),
    itineraryLink: stringValue(patch.itineraryLink, current?.itineraryLink ?? '', 1000),
    rawText: current?.rawText ?? '',
  };
}

function matchStaff(current: MatchStaff | null | undefined, input: unknown): MatchStaff | null {
  const patch = recordValue(input);
  const shouldExist = current !== null && current !== undefined
    || Object.keys(patch).length > 0;
  if (!shouldExist) return null;

  return {
    referee: stringValue(patch.referee, current?.referee ?? '', 200),
    assistant1: stringValue(patch.assistant1, current?.assistant1 ?? '', 200),
    assistant2: stringValue(patch.assistant2, current?.assistant2 ?? '', 200),
    rawText: current?.rawText ?? '',
  };
}

function categoriesValue(value: unknown, fallback: string[] | undefined): string[] | undefined {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) return fallback;
  const unique = [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 100))
    .filter(Boolean))];
  return unique.length ? unique : undefined;
}

export function applyPlanningEventUpdate(
  eventType: PlanningEventType,
  currentEvent: PlanningEvent,
  input: EventUpdateInput,
): PlanningEvent {
  if (eventType === 'officiel' || eventType === 'amical') {
    const current = currentEvent as Match;
    const date = stringValue(input.date, current.date, 20);
    const time = stringValue(input.time, current.time, 20);
    const competition = stringValue(input.competition, current.competition, 250);
    const venue = input.venue === 'domicile' || input.venue === 'extérieur'
      ? input.venue
      : current.venue;

    return {
      ...current,
      date,
      time,
      durationMinutes: durationValue(input.durationMinutes, current.durationMinutes, 90),
      localTeam: stringValue(input.localTeam, current.localTeam, 250),
      awayTeam: stringValue(input.awayTeam, current.awayTeam, 250),
      competition,
      categorie: optionalStringValue(input.categorie, current.categorie, 120),
      venue,
      horaireRendezVous: stringValue(input.horaireRendezVous, current.horaireRendezVous, 20),
      details: matchDetails(current.details, input.details, date, time, competition),
      staff: matchStaff(current.staff, input.staff),
    };
  }

  if (eventType === 'entrainement') {
    const current = currentEvent as Entrainement;
    return {
      ...current,
      date: stringValue(input.date, current.date, 20),
      time: stringValue(input.time, current.time, 20),
      durationMinutes: durationValue(input.durationMinutes, current.durationMinutes, 90),
      lieu: stringValue(input.lieu, current.lieu, 500),
      categorie: optionalStringValue(input.categorie, current.categorie, 120),
    };
  }

  const current = currentEvent as Plateau;
  return {
    ...current,
    date: stringValue(input.date, current.date, 20),
    time: stringValue(input.time, current.time, 20),
    durationMinutes: durationValue(input.durationMinutes, current.durationMinutes, 120),
    lieu: stringValue(input.lieu, current.lieu, 500),
    categories: categoriesValue(input.categories, current.categories),
  };
}
