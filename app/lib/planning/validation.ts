import type { DataSource } from 'typeorm';
import type { OfficielIndisponibilite } from '@/lib/utils/officiel-availability';
import { getOfficielAvailabilityStatus } from '@/lib/utils/officiel-availability';
import type { AssignmentContact, Entrainement, PersonType, Plateau } from '@/types/match';
import {
  activeContacts,
  eventEndTimestamp,
  eventStartTimestamp,
  hasCoveredRole,
  isVisiblePublicationStatus,
} from './p0-rules';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';
import { listPlanningEventSnapshots } from './event-store';
import { getCurrentClubId } from '@/lib/auth/club-context';
import type { UserEntity } from '@/lib/db/schemas';

export type PublicationBlockerCode =
  | 'invalid-schedule'
  | 'missing-arbitre'
  | 'missing-encadrant'
  | 'missing-accompagnateur';

export interface PublicationBlocker {
  code: PublicationBlockerCode;
  message: string;
  role?: PlanningRole;
}

export interface PublicationReadiness {
  ready: boolean;
  blockers: PublicationBlocker[];
}

export class PlanningValidationError extends Error {
  constructor(
    message: string,
    public readonly details: Array<{ code: string; message: string }>,
  ) {
    super(message);
    this.name = 'PlanningValidationError';
  }
}

const ROLE_LABELS: Record<PlanningRole, string> = {
  arbitre: 'arbitre',
  encadrant: 'encadrant',
  accompagnateur: 'accompagnateur',
};

export function requiredRolesForEvent(snapshot: PlanningEventSnapshot): PlanningRole[] {
  return snapshot.eventType === 'officiel' || snapshot.eventType === 'amical'
    ? ['arbitre', 'encadrant', 'accompagnateur']
    : ['encadrant'];
}

export function assessPublicationReadiness(snapshot: PlanningEventSnapshot): PublicationReadiness {
  const blockers: PublicationBlocker[] = [];
  if (eventStartTimestamp(snapshot.date, snapshot.time) === null) {
    blockers.push({ code: 'invalid-schedule', message: 'La date ou l’heure de l’événement est invalide.' });
  }

  for (const role of requiredRolesForEvent(snapshot)) {
    if (!hasCoveredRole(snapshot.assignments[role])) {
      blockers.push({
        code: `missing-${role}` as PublicationBlockerCode,
        message: `Le rôle ${ROLE_LABELS[role]} doit être couvert avant publication.`,
        role,
      });
    }
  }

  return { ready: blockers.length === 0, blockers };
}

export interface AssignmentPerson {
  id: number;
  nom: string;
  indisponibilites?: OfficielIndisponibilite[] | null;
}

export interface AssignmentViolation {
  code: 'unlinked-person' | 'invalid-person-type' | 'unknown-person' | 'unavailable' | 'conflict';
  message: string;
  personId: number | null;
}

function personTypeForRole(role: PlanningRole): PersonType {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

function overlaps(first: PlanningEventSnapshot, second: PlanningEventSnapshot, bufferMinutes = 30): boolean {
  const firstStart = eventStartTimestamp(first.date, first.time);
  const firstEnd = eventEndTimestamp(first.date, first.time, first.durationMinutes);
  const secondStart = eventStartTimestamp(second.date, second.time);
  const secondEnd = eventEndTimestamp(second.date, second.time, second.durationMinutes);
  if (firstStart === null || firstEnd === null || secondStart === null || secondEnd === null) return false;
  const buffer = bufferMinutes * 60_000;
  return firstStart < secondEnd + buffer && secondStart < firstEnd + buffer;
}

export function validateAssignmentSet(input: {
  target: PlanningEventSnapshot;
  role: PlanningRole;
  contacts: AssignmentContact[];
  people: AssignmentPerson[];
  snapshots: PlanningEventSnapshot[];
}): AssignmentViolation[] {
  const expectedType = personTypeForRole(input.role);
  const byId = new Map(input.people.map((person) => [person.id, person]));
  const violations: AssignmentViolation[] = [];

  for (const contact of activeContacts(input.contacts)) {
    if (contact.personId === undefined) {
      violations.push({ code: 'unlinked-person', personId: null, message: `${contact.nom} doit être sélectionné dans le référentiel du club.` });
      continue;
    }
    if (contact.personType && contact.personType !== expectedType) {
      violations.push({ code: 'invalid-person-type', personId: contact.personId, message: `${contact.nom} n’a pas le bon type pour ce rôle.` });
      continue;
    }
    const person = byId.get(contact.personId);
    if (!person) {
      violations.push({ code: 'unknown-person', personId: contact.personId, message: `${contact.nom} n’existe plus dans le référentiel.` });
      continue;
    }
    if (getOfficielAvailabilityStatus({ ...person, indisponibilites: person.indisponibilites ?? [] }, input.target.date, input.target.time).unavailable) {
      violations.push({ code: 'unavailable', personId: contact.personId, message: `${person.nom} est indisponible sur ce créneau.` });
    }
    const conflict = input.snapshots.some((snapshot) =>
      (snapshot.eventId !== input.target.eventId || snapshot.eventType !== input.target.eventType)
      && isVisiblePublicationStatus(snapshot.planningStatus)
      && overlaps(input.target, snapshot)
      && Object.values(snapshot.assignments).some((contacts) => activeContacts(contacts).some((assigned) =>
        assigned.personId === contact.personId && assigned.personType === expectedType,
      )),
    );
    if (conflict) {
      violations.push({ code: 'conflict', personId: contact.personId, message: `${person.nom} possède déjà une affectation qui chevauche ce créneau.` });
    }
  }
  return violations;
}

export async function validateAssignmentsAgainstDatabase(
  db: DataSource,
  target: PlanningEventSnapshot,
  role: PlanningRole,
  contacts: AssignmentContact[],
): Promise<AssignmentViolation[]> {
  const userRepo = db.getRepository<UserEntity>('User');
  const [users, snapshots] = await Promise.all([
    userRepo.findBy({ clubId: getCurrentClubId() }),
    listPlanningEventSnapshots(db),
  ]);
  const people: AssignmentPerson[] = users.filter((user) => user.roles.includes(role));
  return validateAssignmentSet({ target, role, contacts, people, snapshots });
}

export async function validateSimpleEventAssignments(
  db: DataSource,
  event: Entrainement | Plateau,
): Promise<AssignmentViolation[]> {
  const snapshot: PlanningEventSnapshot = {
    eventId: event.id,
    eventType: event.type,
    title: event.type === 'entrainement' ? 'Entraînement' : 'Plateau',
    date: event.date,
    time: event.time,
    durationMinutes: event.durationMinutes ?? (event.type === 'plateau' ? 120 : 90),
    location: event.lieu || null,
    planningStatus: event.planningStatus ?? 'draft',
    event,
    extras: null,
    assignments: { arbitre: [], encadrant: event.encadrants ?? [], accompagnateur: [] },
    revision: event.planningRevision ?? 0,
  };
  return validateAssignmentsAgainstDatabase(db, snapshot, 'encadrant', event.encadrants ?? []);
}
