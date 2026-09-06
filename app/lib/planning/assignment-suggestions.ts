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
import { getPlanningRecord } from './records';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import {
  DEFAULT_PLANNING_PREFERENCES,
  normalizePlanningPreferences,
  scorePreferenceMatch,
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

  const suggestions: AssignmentSuggestion[] = [];
  for (const candidate of candidates) {
    if (assignedOnTarget.some((contact) => contactMatchesCandidate(contact, candidate, personType))) continue;

    const availability = getOfficielAvailabilityStatus(
      { ...candidate, indisponibilites: candidate.indisponibilites ?? [] },
      target.date,
      target.time,
    );
    if (availability.unavailable) continue;

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
