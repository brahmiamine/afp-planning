import type { DataSource } from 'typeorm';
import type { StadeEntity, UserEntity } from '@/lib/db/schemas';
import type { AssignmentContact, PersonType } from '@/types/match';
import { getOfficielAvailabilityStatus } from '@/lib/utils/officiel-availability';
import {
  activeContacts,
  eventEndTimestamp,
  eventStartTimestamp,
  isVisiblePublicationStatus,
} from './p0-rules';
import { zonedDayKey, zonedIsoWeekKey } from './planning-time';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';
import { listPlanningEventSnapshots } from './event-store';
import { getPlanningRecord, listPlanningRecords } from './records';
import { eventCoordinatesFromResources } from './resources';
import {
  estimateTravelMinutes,
  geocodePlace,
  travelFitsPreference,
  type TravelEstimate,
  type TravelEstimateOptions,
} from './travel';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import {
  DEFAULT_PLANNING_PREFERENCES,
  assignmentWithinAvailabilityResponse,
  normalizePlanningPreferences,
  scorePreferenceMatch,
  type AvailabilityResponseInput,
  type PersonPlanningPreferences,
} from './advanced-rules';

export interface AssignmentSuggestion {
  personId: number;
  personType: PersonType;
  nom: string;
  telephone: string | null;
  score: number;
  load30Days: number;
  upcomingLoad: number;
  reasons: string[];
}

export interface AssignmentSuggestionOptions {
  fetchImpl?: typeof fetch;
}

type CandidateEntity = UserEntity;

function personTypeForPlanningRole(role: PlanningRole): PersonType {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

async function listCandidates(db: DataSource, role: PlanningRole): Promise<CandidateEntity[]> {
  const clubId = getCurrentClubId();
  const users = await db.getRepository<UserEntity>('User').find({ where: { clubId, active: true }, order: { nom: 'ASC' } });
  return users.filter((user) => user.roles.includes(role));
}

function contactMatchesCandidate(contact: AssignmentContact, candidate: CandidateEntity, personType: PersonType): boolean {
  if (contact.personId !== undefined && contact.personType) {
    return contact.personId === candidate.id && contact.personType === personType;
  }
  return contact.nom.trim().toLowerCase() === candidate.nom.trim().toLowerCase();
}

function overlaps(
  first: PlanningEventSnapshot,
  second: PlanningEventSnapshot,
  bufferMinutes = 30,
  timeZone = 'UTC',
): boolean {
  const firstStart = eventStartTimestamp(first.date, first.time, timeZone);
  const secondStart = eventStartTimestamp(second.date, second.time, timeZone);
  const firstEnd = eventEndTimestamp(first.date, first.time, first.durationMinutes, timeZone);
  const secondEnd = eventEndTimestamp(second.date, second.time, second.durationMinutes, timeZone);
  if (firstStart === null || secondStart === null || firstEnd === null || secondEnd === null) return false;
  const buffer = bufferMinutes * 60_000;
  return firstStart < secondEnd + buffer && secondStart < firstEnd + buffer;
}

function candidateAssignments(
  snapshots: PlanningEventSnapshot[],
  candidate: CandidateEntity,
  personType: PersonType,
): PlanningEventSnapshot[] {
  return snapshots.filter((snapshot) => {
    if (!isVisiblePublicationStatus(snapshot.planningStatus)) return false;
    return Object.values(snapshot.assignments).some((contacts) =>
      activeContacts(contacts).some((contact) => contactMatchesCandidate(contact, candidate, personType)),
    );
  });
}

async function loadPreferences(
  db: DataSource,
  personType: PersonType,
  personId: number,
): Promise<PersonPlanningPreferences> {
  const record = await getPlanningRecord<PersonPlanningPreferences>(db, `person-preference:${personType}:${personId}`);
  return record ? normalizePlanningPreferences(record.payload) : DEFAULT_PLANNING_PREFERENCES;
}

interface AvailabilityRequestPayload {
  startDate: string;
  endDate: string;
  targetRoles: PlanningRole[];
}

interface AvailabilityResponsePayload extends AvailabilityResponseInput {
  respondedAt: string;
}

/**
 * Dernière réponse de chaque candidat aux campagnes de disponibilité couvrant la date de
 * l'événement pour ce rôle, indexée par userId (issue #86). `null` si aucune campagne
 * applicable n'existe : le comportement d'auto-affectation reste alors inchangé.
 */
async function loadAvailabilityResponses(
  db: DataSource,
  target: PlanningEventSnapshot,
  role: PlanningRole,
  timeZone: string,
): Promise<Map<number, AvailabilityResponsePayload> | null> {
  const campaigns = await listPlanningRecords<AvailabilityRequestPayload>(db, { kind: 'availability-request' }, 500);
  const targetStart = eventStartTimestamp(target.date, target.time, timeZone);
  if (targetStart === null) return null;
  const applicable = campaigns.filter((campaign) => {
    if (!campaign.payload.targetRoles?.includes(role)) return false;
    const from = eventStartTimestamp(campaign.payload.startDate, '00:00', timeZone);
    const to = eventStartTimestamp(campaign.payload.endDate, '23:59', timeZone);
    return from !== null && to !== null && targetStart >= from && targetStart <= to;
  });
  if (applicable.length === 0) return null;

  const responsesByUser = new Map<number, AvailabilityResponsePayload>();
  for (const campaign of applicable) {
    const responses = await listPlanningRecords<AvailabilityResponsePayload>(
      db,
      { kind: 'availability-response', eventId: campaign.id },
      500,
    );
    for (const response of responses) {
      if (response.ownerUserId === null) continue;
      const existing = responsesByUser.get(response.ownerUserId);
      if (!existing || response.payload.respondedAt > existing.respondedAt) {
        responsesByUser.set(response.ownerUserId, response.payload);
      }
    }
  }
  return responsesByUser;
}

const UNAVAILABLE_TRAVEL: TravelEstimate = { status: 'unavailable', straightLineKm: 0, source: 'unavailable' };

/**
 * Estime le trajet « club → lieu de l'événement » (issue #89). L'origine est le stade
 * principal du club (premier stade dont l'adresse est géocodable) ; la destination est
 * le point des ressources réservées, sinon le géocodage du lieu. L'estimation est commune
 * à tous les candidats : un seul calcul par événement. Toute indisponibilité (pas de
 * stade, géocodage ou routage en échec) retourne une estimation « unavailable » : le
 * candidat n'est alors pas exclu mais la raison l'explicite.
 */
async function estimateClubToVenueTravel(
  db: DataSource,
  clubId: string,
  target: PlanningEventSnapshot,
  options: TravelEstimateOptions,
): Promise<TravelEstimate> {
  const resourcePoint = await eventCoordinatesFromResources(db, target.eventType, target.eventId);
  const destination = resourcePoint
    ? { lat: resourcePoint.lat, lon: resourcePoint.lon }
    : (target.location ? await geocodePlace(target.location, options) : null);
  if (!destination) return UNAVAILABLE_TRAVEL;

  const stades = await db.getRepository<StadeEntity>('Stade').find({ where: { clubId } });
  for (const stade of stades) {
    if (!stade.adresse?.trim()) continue;
    const origin = await geocodePlace(stade.adresse, options);
    if (origin) return estimateTravelMinutes(origin, destination, options);
  }
  return UNAVAILABLE_TRAVEL;
}

interface PendingCandidate {
  candidate: CandidateEntity;
  preferences: PersonPlanningPreferences;
  availabilityResponse: AvailabilityResponsePayload | null;
  load30Days: number;
  upcomingLoad: number;
  sameDayLoad: number;
  targetWeekLoad: number;
  preference: ReturnType<typeof scorePreferenceMatch>;
}

export async function buildAssignmentSuggestions(
  db: DataSource,
  target: PlanningEventSnapshot,
  role: PlanningRole,
  limit = 5,
  options: AssignmentSuggestionOptions = {},
): Promise<AssignmentSuggestion[]> {
  if (target.eventType !== 'officiel' && target.eventType !== 'amical' && role !== 'encadrant') return [];

  const clubId = getCurrentClubId();
  const [candidates, snapshots, settings] = await Promise.all([
    listCandidates(db, role),
    listPlanningEventSnapshots(db),
    readAppSettings(db, clubId),
  ]);
  // Toutes les comparaisons temporelles (conflits, charge, même jour, semaine) utilisent
  // le fuseau horaire du club (issue #45).
  const timeZone = settings.timeZone;
  const personType = personTypeForPlanningRole(role);
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60_000;
  const assignedOnTarget = Object.values(target.assignments).flat();
  // Réponses aux campagnes de disponibilité couvrant cette date pour ce rôle (issue #86) :
  // une réponse « indisponible » exclut le candidat, une disponibilité « partielle » le
  // limite à son créneau. `null` = aucune campagne applicable, comportement inchangé.
  const availabilityResponses = await loadAvailabilityResponses(db, target, role, timeZone);

  const pending: PendingCandidate[] = [];
  for (const candidate of candidates) {
    if (assignedOnTarget.some((contact) => contactMatchesCandidate(contact, candidate, personType))) continue;

    const availability = getOfficielAvailabilityStatus(
      { ...candidate, indisponibilites: candidate.indisponibilites ?? [] },
      target.date,
      target.time,
    );
    if (availability.unavailable) continue;

    const availabilityResponse = availabilityResponses?.get(candidate.id) ?? null;
    if (availabilityResponse && !assignmentWithinAvailabilityResponse(availabilityResponse, target.time, target.durationMinutes)) continue;

    const assignments = candidateAssignments(snapshots, candidate, personType);
    const conflict = assignments.some((snapshot) => snapshot.eventId !== target.eventId && overlaps(target, snapshot, 30, timeZone));
    if (conflict) continue;

    const preferences = await loadPreferences(db, personType, candidate.id);
    let load30Days = 0;
    let upcomingLoad = 0;
    let sameDayLoad = 0;
    let targetWeekLoad = 0;
    const targetStart = eventStartTimestamp(target.date, target.time, timeZone);
    const targetWeek = targetStart === null ? null : zonedIsoWeekKey(targetStart, timeZone);
    const targetDay = targetStart === null ? null : zonedDayKey(targetStart, timeZone);

    for (const snapshot of assignments) {
      const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
      if (start === null) continue;
      if (start >= thirtyDaysAgo && start <= now) load30Days += 1;
      if (start >= now) upcomingLoad += 1;
      if (targetDay !== null && zonedDayKey(start, timeZone) === targetDay) sameDayLoad += 1;
      if (targetWeek && zonedIsoWeekKey(start, timeZone) === targetWeek) targetWeekLoad += 1;
    }

    if (preferences.maxAssignmentsPerWeek !== null && targetWeekLoad >= preferences.maxAssignmentsPerWeek) continue;

    const preference = scorePreferenceMatch(preferences, target, timeZone);
    pending.push({
      candidate,
      preferences,
      availabilityResponse,
      load30Days,
      upcomingLoad,
      sameDayLoad,
      targetWeekLoad,
      preference,
    });
  }

  // Limite de trajet (issue #89) : une seule estimation « club → lieu », commune à tous
  // les candidats, et seulement si au moins l'un d'eux a configuré une limite — sinon
  // aucun appel réseau et le comportement est strictement inchangé.
  const travelEstimate = pending.some((item) => item.preferences.maxTravelMinutes !== null)
    ? await estimateClubToVenueTravel(db, clubId, target, options)
    : null;

  const suggestions: AssignmentSuggestion[] = [];
  for (const item of pending) {
    const { candidate, preferences, availabilityResponse, load30Days, upcomingLoad, sameDayLoad, targetWeekLoad, preference } = item;
    // Limite dure, cohérente avec maxAssignmentsPerWeek : un trajet estimé au-delà de la
    // limite exclut le candidat. Une estimation indisponible n'exclut jamais.
    if (travelEstimate && travelFitsPreference(travelEstimate, preferences.maxTravelMinutes) === false) continue;

    const score = Math.max(0, 100 - load30Days * 5 - upcomingLoad * 3 - sameDayLoad * 12 + preference.bonus);
    const reasons = [
      'Disponible sur le créneau',
      'Aucun conflit détecté',
      `${load30Days} affectation(s) sur les 30 derniers jours`,
      `${upcomingLoad} affectation(s) à venir`,
      ...preference.reasons,
    ];
    if (sameDayLoad === 0) reasons.push('Aucune autre affectation ce jour-là');
    if (preferences.maxAssignmentsPerWeek !== null) {
      reasons.push(`${targetWeekLoad}/${preferences.maxAssignmentsPerWeek} affectation(s) sur la semaine cible`);
    }
    if (preferences.maxTravelMinutes !== null) {
      reasons.push(travelEstimate?.status === 'ok'
        ? `Trajet estimé : ${travelEstimate.minutes} min (limite ${preferences.maxTravelMinutes} min)`
        : 'Trajet non estimable — limite de trajet non vérifiée');
    }
    if (availabilityResponse) {
      reasons.push(
        availabilityResponse.status === 'partial'
          ? 'Disponibilité partielle compatible avec ce créneau'
          : 'A répondu disponible à la campagne de disponibilité',
      );
    }

    suggestions.push({
      personId: candidate.id,
      personType,
      nom: candidate.nom,
      telephone: candidate.telephone,
      score,
      load30Days,
      upcomingLoad,
      reasons,
    });
  }

  return suggestions
    .sort((a, b) => b.score - a.score || a.load30Days - b.load30Days || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, Math.max(1, Math.min(limit, 20)));
}
