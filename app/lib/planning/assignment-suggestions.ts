import type { DataSource } from 'typeorm';
import type { UserEntity } from '@/lib/db/schemas';
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
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import { eventCoordinatesFromResources } from './resources';
import { estimateTravelMinutes, travelFitsPreference, type TravelEstimate } from './travel';
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

export async function buildAssignmentSuggestions(
  db: DataSource,
  target: PlanningEventSnapshot,
  role: PlanningRole,
  limit = 5,
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

  // Cache les lieux et itinéraires pendant un même calcul de suggestions : plusieurs
  // candidats peuvent partager les mêmes événements et le service de routage ne doit
  // pas être rappelé inutilement.
  const coordinateCache = new Map<string, Promise<{ lat: number; lon: number; resourceName: string } | null>>();
  const travelCache = new Map<string, Promise<TravelEstimate>>();
  const eventPoint = (snapshot: PlanningEventSnapshot) => {
    const key = `${snapshot.eventType}:${snapshot.eventId}`;
    let pending = coordinateCache.get(key);
    if (!pending) {
      pending = eventCoordinatesFromResources(db, snapshot.eventType, snapshot.eventId);
      coordinateCache.set(key, pending);
    }
    return pending;
  };
  const estimateBetween = (
    fromKey: string,
    from: { lat: number; lon: number },
    toKey: string,
    to: { lat: number; lon: number },
  ) => {
    const key = `${fromKey}->${toKey}`;
    let pending = travelCache.get(key);
    if (!pending) {
      pending = estimateTravelMinutes(from, to);
      travelCache.set(key, pending);
    }
    return pending;
  };

  const suggestions: AssignmentSuggestion[] = [];
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
    const sameDayAssignments: PlanningEventSnapshot[] = [];
    const targetStart = eventStartTimestamp(target.date, target.time, timeZone);
    const targetWeek = targetStart === null ? null : zonedIsoWeekKey(targetStart, timeZone);
    const targetDay = targetStart === null ? null : zonedDayKey(targetStart, timeZone);

    for (const snapshot of assignments) {
      const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
      if (start === null) continue;
      if (start >= thirtyDaysAgo && start <= now) load30Days += 1;
      if (start >= now) upcomingLoad += 1;
      if (targetDay !== null && zonedDayKey(start, timeZone) === targetDay) {
        sameDayLoad += 1;
        if (snapshot.eventId !== target.eventId) sameDayAssignments.push(snapshot);
      }
      if (targetWeek && zonedIsoWeekKey(start, timeZone) === targetWeek) targetWeekLoad += 1;
    }

    if (preferences.maxAssignmentsPerWeek !== null && targetWeekLoad >= preferences.maxAssignmentsPerWeek) continue;

    const travelReasons: string[] = [];
    if (preferences.maxTravelMinutes !== null) {
      if (sameDayAssignments.length === 0) {
        travelReasons.push(`Trajet max ${preferences.maxTravelMinutes} min : aucun trajet inter-événements à vérifier ce jour-là`);
      } else {
        const targetPoint = await eventPoint(target);
        if (!targetPoint) {
          travelReasons.push('Trajet non estimable : lieu de l’événement cible non géolocalisé');
        } else {
          let travelBlocked = false;
          for (const other of sameDayAssignments) {
            const otherPoint = await eventPoint(other);
            if (!otherPoint) {
              travelReasons.push(`Trajet non estimable avec « ${other.title} » : lieu non géolocalisé`);
              continue;
            }

            const otherStart = eventStartTimestamp(other.date, other.time, timeZone);
            const otherBeforeTarget = targetStart !== null && otherStart !== null && otherStart <= targetStart;
            const fromSnapshot = otherBeforeTarget ? other : target;
            const toSnapshot = otherBeforeTarget ? target : other;
            const fromPoint = otherBeforeTarget ? otherPoint : targetPoint;
            const toPoint = otherBeforeTarget ? targetPoint : otherPoint;
            const estimate = await estimateBetween(
              `${fromSnapshot.eventType}:${fromSnapshot.eventId}`,
              fromPoint,
              `${toSnapshot.eventType}:${toSnapshot.eventId}`,
              toPoint,
            );
            const fits = travelFitsPreference(estimate, preferences.maxTravelMinutes);
            if (fits === false && estimate.status === 'ok') {
              travelReasons.push(
                `Trajet estimé ${estimate.minutes} min > limite ${preferences.maxTravelMinutes} min avec « ${other.title} »`,
              );
              travelBlocked = true;
              break;
            }
            if (fits === null) {
              travelReasons.push(`Trajet non estimable avec « ${other.title} »`);
            } else if (estimate.status === 'ok') {
              travelReasons.push(
                `Trajet estimé ${estimate.minutes} min ≤ limite ${preferences.maxTravelMinutes} min avec « ${other.title} »`,
              );
            }
          }
          if (travelBlocked) continue;
        }
      }
    }

    const preference = scorePreferenceMatch(preferences, target, timeZone);
    const score = Math.max(0, 100 - load30Days * 5 - upcomingLoad * 3 - sameDayLoad * 12 + preference.bonus);
    const reasons = [
      'Disponible sur le créneau',
      'Aucun conflit détecté',
      `${load30Days} affectation(s) sur les 30 derniers jours`,
      `${upcomingLoad} affectation(s) à venir`,
      ...preference.reasons,
      ...travelReasons,
    ];
    if (sameDayLoad === 0) reasons.push('Aucune autre affectation ce jour-là');
    if (preferences.maxAssignmentsPerWeek !== null) {
      reasons.push(`${targetWeekLoad}/${preferences.maxAssignmentsPerWeek} affectation(s) sur la semaine cible`);
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
