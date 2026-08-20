import type { DataSource } from 'typeorm';
import type {
  AccompagnateurEntity,
  EncadrantEntity,
  OfficielEntity,
} from '@/lib/db/schemas';
import type { AssignmentContact, PersonType } from '@/types/match';
import { getOfficielAvailabilityStatus } from '@/lib/utils/officiel-availability';
import {
  activeContacts,
  eventEndTimestamp,
  eventStartTimestamp,
  isVisiblePublicationStatus,
} from './p0-rules';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';
import { listPlanningEventSnapshots } from './event-store';

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

type CandidateEntity = OfficielEntity | EncadrantEntity | AccompagnateurEntity;

function personTypeForPlanningRole(role: PlanningRole): PersonType {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

async function listCandidates(db: DataSource, role: PlanningRole): Promise<CandidateEntity[]> {
  if (role === 'arbitre') return db.getRepository<OfficielEntity>('Officiel').find({ order: { nom: 'ASC' } });
  if (role === 'encadrant') return db.getRepository<EncadrantEntity>('Encadrant').find({ order: { nom: 'ASC' } });
  return db.getRepository<AccompagnateurEntity>('Accompagnateur').find({ order: { nom: 'ASC' } });
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
): boolean {
  const firstStart = eventStartTimestamp(first.date, first.time);
  const secondStart = eventStartTimestamp(second.date, second.time);
  const firstEnd = eventEndTimestamp(first.date, first.time, first.durationMinutes);
  const secondEnd = eventEndTimestamp(second.date, second.time, second.durationMinutes);
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

export async function buildAssignmentSuggestions(
  db: DataSource,
  target: PlanningEventSnapshot,
  role: PlanningRole,
  limit = 5,
): Promise<AssignmentSuggestion[]> {
  if (target.eventType !== 'officiel' && target.eventType !== 'amical' && role !== 'encadrant') return [];

  const [candidates, snapshots] = await Promise.all([
    listCandidates(db, role),
    listPlanningEventSnapshots(db),
  ]);
  const personType = personTypeForPlanningRole(role);
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60_000;
  const assignedOnTarget = Object.values(target.assignments).flat();

  const suggestions: AssignmentSuggestion[] = [];
  for (const candidate of candidates) {
    if (assignedOnTarget.some((contact) => contactMatchesCandidate(contact, candidate, personType))) continue;

    const availability = getOfficielAvailabilityStatus(candidate, target.date, target.time);
    if (availability.unavailable) continue;

    const assignments = candidateAssignments(snapshots, candidate, personType);
    const conflict = assignments.some((snapshot) => snapshot.eventId !== target.eventId && overlaps(target, snapshot));
    if (conflict) continue;

    let load30Days = 0;
    let upcomingLoad = 0;
    let sameDayLoad = 0;
    const targetStart = eventStartTimestamp(target.date, target.time);

    for (const snapshot of assignments) {
      const start = eventStartTimestamp(snapshot.date, snapshot.time);
      if (start === null) continue;
      if (start >= thirtyDaysAgo && start <= now) load30Days += 1;
      if (start >= now) upcomingLoad += 1;
      if (targetStart !== null) {
        const targetDay = new Date(targetStart).toISOString().slice(0, 10);
        const eventDay = new Date(start).toISOString().slice(0, 10);
        if (targetDay === eventDay) sameDayLoad += 1;
      }
    }

    const score = Math.max(0, 100 - load30Days * 5 - upcomingLoad * 3 - sameDayLoad * 12);
    const reasons = [
      'Disponible sur le créneau',
      'Aucun conflit détecté',
      `${load30Days} affectation(s) sur les 30 derniers jours`,
      `${upcomingLoad} affectation(s) à venir`,
    ];
    if (sameDayLoad === 0) reasons.push('Aucune autre affectation ce jour-là');

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
