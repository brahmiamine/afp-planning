import type { DataSource, EntityManager } from 'typeorm';
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
import { getPlanningRecord } from './records';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { functionForPlanningRole, userHoldsFunction } from './person-link';
import { readAppSettings } from '@/lib/settings-store';
import { eventCoordinatesFromResources } from './resources';
import { estimateTravelMinutes, travelFitsPreference, type TravelEstimate } from './travel';
import {
  DEFAULT_PLANNING_PREFERENCES,
  normalizePlanningPreferences,
  scorePreferenceMatch,
  type PersonPlanningPreferences,
} from './advanced-rules';

type Queryable = DataSource | EntityManager;

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

async function listCandidates(db: Queryable, role: PlanningRole): Promise<CandidateEntity[]> {
  const clubId = getCurrentClubId();
  const users = await db.getRepository<UserEntity>('User').find({ where: { clubId, active: true }, order: { nom: 'ASC' } });
  return users.filter((user) => userHoldsFunction(user, functionForPlanningRole(role)));
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

/**
 * Vrai si le candidat (identité = personId, indépendamment de la fonction occupée) a déjà
 * une affectation active qui chevauche la cible, y compris sur un événement encore en
 * brouillon (issue #205) : un dirigeant Arbitre club sur un événement et Encadrant sur un
 * autre reste la même personne, et deux brouillons peuvent se chevaucher avant publication.
 */
export function candidateHasOverlappingAssignment(
  snapshots: PlanningEventSnapshot[],
  candidate: CandidateEntity,
  target: PlanningEventSnapshot,
  timeZone: string,
): boolean {
  return snapshots.some((snapshot) => {
    if (snapshot.eventId === target.eventId && snapshot.eventType === target.eventType) return false;
    if (snapshot.planningStatus === 'cancelled') return false;
    if (!overlaps(target, snapshot, 30, timeZone)) return false;
    return Object.values(snapshot.assignments).some((contacts) =>
      activeContacts(contacts).some((contact) => contact.personId === candidate.id),
    );
  });
}

async function loadPreferences(
  db: Queryable,
  personType: PersonType,
  personId: number,
): Promise<PersonPlanningPreferences> {
  const record = await getPlanningRecord<PersonPlanningPreferences>(db, `person-preference:${personType}:${personId}`);
  return record ? normalizePlanningPreferences(record.payload) : DEFAULT_PLANNING_PREFERENCES;
}

export async function buildAssignmentSuggestions(
  db: Queryable,
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
    // Règle (issue #205) : une même personne peut tenir plusieurs fonctions différentes sur
    // un même événement (ex. encadrant ET accompagnateur) — seule la ré-affectation au même
    // rôle est bloquée ici ; le conflit inter-événements est vérifié séparément ci-dessous
    // sur l'identité (personId) tous rôles confondus, brouillons inclus.
    if (assignedOnTarget.some((contact) => contactMatchesCandidate(contact, candidate, personType))) continue;

    const availability = getOfficielAvailabilityStatus(
      { ...candidate, indisponibilites: candidate.indisponibilites ?? [] },
      target.date,
      target.time,
    );
    if (availability.unavailable) continue;

    const assignments = candidateAssignments(snapshots, candidate, personType);
    // Issue #205 : le conflit se détecte sur l'identité (personId) tous rôles confondus et
    // y compris entre brouillons, contrairement à `assignments` ci-dessus qui reste
    // volontairement scopé au rôle et aux événements publiés pour les métriques de charge.
    if (candidateHasOverlappingAssignment(snapshots, candidate, target, timeZone)) continue;

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
