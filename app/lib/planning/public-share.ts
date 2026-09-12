import { createHash, randomBytes } from 'node:crypto';
import type { Match } from '@/types/match';
import type { PlanningEventSnapshot, PlanningEventType, PlanningRole } from './event-store';
import type { TeamLogoResolver } from './team-logos';

export interface PublicPlanningOfficial {
  role: PlanningRole;
  nom: string;
}

export interface PublicPlanningItem {
  eventType: PlanningEventType;
  title: string;
  date: string;
  time: string;
  /** Heure de fin calculée à partir de `time` + `durationMinutes` (null si l'heure de début manque). */
  endTime: string | null;
  durationMinutes: number;
  location: string | null;
  category: string | null;
  /** Heure de rendez-vous / convocation, quand elle est renseignée (rencontres). */
  meetingTime: string | null;
  /** Champs « rencontre » (matchs officiels et amicaux) — null pour les entraînements et plateaux. */
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  venue: 'domicile' | 'extérieur' | null;
  stadium: string | null;
  address: string | null;
  /** Arbitres officiels renseignés par la source (matchs officiels). */
  referee: string | null;
  assistants: string[];
  /**
   * Personnes affectées, nom uniquement : le lien public ne transporte jamais de
   * numéro de téléphone ni d'autre donnée personnelle des affectés.
   */
  officials: PublicPlanningOfficial[];
  /** Prévision à l’heure de l’événement, si la météo est activée. */
  weather?: {
    weatherCode: number;
    temperatureC: number | null;
  } | null;
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

/** Heure de fin « HH:MM » à partir d'une heure de début « HH:MM » et d'une durée en minutes. */
export function endTimeFromStart(time: string, durationMinutes: number): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const start = Number.parseInt(match[1] ?? '', 10) * 60 + Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(start) || !Number.isFinite(durationMinutes)) return null;
  const end = ((start + Math.max(0, Math.round(durationMinutes))) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function isMatchEvent(snapshot: PlanningEventSnapshot): snapshot is PlanningEventSnapshot & { event: Match } {
  return snapshot.eventType === 'officiel' || snapshot.eventType === 'amical';
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function collectOfficials(snapshot: PlanningEventSnapshot): PublicPlanningOfficial[] {
  const officials: PublicPlanningOfficial[] = [];
  for (const [role, contacts] of Object.entries(snapshot.assignments ?? {})) {
    if (!Array.isArray(contacts)) continue;
    for (const contact of contacts) {
      const nom = cleanString(contact?.nom);
      if (nom) officials.push({ role: role as PlanningRole, nom });
    }
  }
  return officials;
}

export function toPublicPlanningItem(
  snapshot: PlanningEventSnapshot,
  resolveLogos?: TeamLogoResolver,
): PublicPlanningItem {
  const base: PublicPlanningItem = {
    eventType: snapshot.eventType,
    title: snapshot.title,
    date: snapshot.date,
    time: snapshot.time,
    endTime: endTimeFromStart(snapshot.time, snapshot.durationMinutes),
    durationMinutes: snapshot.durationMinutes,
    location: snapshot.location,
    category: eventCategory(snapshot),
    meetingTime: null,
    competition: null,
    homeTeam: null,
    awayTeam: null,
    homeTeamLogo: null,
    awayTeamLogo: null,
    venue: null,
    stadium: null,
    address: null,
    referee: null,
    assistants: [],
    officials: collectOfficials(snapshot),
  };

  if (isMatchEvent(snapshot)) {
    const match = snapshot.event;
    const logos = resolveLogos?.(match) ?? {};
    base.meetingTime = cleanString(match.horaireRendezVous);
    base.competition = cleanString(match.competition) ?? cleanString(match.details?.competition);
    base.homeTeam = cleanString(match.localTeam);
    base.awayTeam = cleanString(match.awayTeam);
    base.homeTeamLogo = cleanString(logos.localTeamLogo);
    base.awayTeamLogo = cleanString(logos.awayTeamLogo);
    base.venue = match.venue === 'domicile' || match.venue === 'extérieur' ? match.venue : null;
    base.stadium = cleanString(match.details?.stadium) ?? snapshot.location;
    base.address = cleanString(match.details?.address);
    base.referee = cleanString(match.staff?.referee);
    base.assistants = [match.staff?.assistant1, match.staff?.assistant2]
      .map(cleanString)
      .filter((value): value is string => value !== null);
  }

  return base;
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
