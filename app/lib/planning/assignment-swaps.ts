import type { AssignmentContact, PersonType } from '@/types/match';
import type { SessionUser } from '@/lib/auth/session';
import type { PlanningEventSnapshot, PlanningEventType, PlanningRole } from './event-store';
import { personIdentityMatches } from './person-link';
import { eventStartTimestamp, isVisiblePublicationStatus } from './p0-rules';

export type AssignmentSwapStatus = 'pending-target' | 'pending-admin' | 'declined' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type AssignmentSwapDecisionActor = 'target' | 'admin';
export type AssignmentSwapDecision = 'accept' | 'decline' | 'approve' | 'reject';

export interface AssignmentSwapPerson {
  userId: number;
  personType: PersonType;
  personId: number;
  nom: string;
}

export interface AssignmentSwapPayload {
  role: PlanningRole;
  eventType: PlanningEventType;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  requester: AssignmentSwapPerson;
  target: AssignmentSwapPerson;
  status: AssignmentSwapStatus;
  message: string | null;
  createdAt: string;
  targetRespondedAt: string | null;
  adminRespondedAt: string | null;
  adminUserId: number | null;
}

export function nextAssignmentSwapStatus(
  current: AssignmentSwapStatus,
  actor: AssignmentSwapDecisionActor,
  decision: AssignmentSwapDecision,
): AssignmentSwapStatus | null {
  if (current === 'pending-target' && actor === 'target') {
    if (decision === 'accept') return 'pending-admin';
    if (decision === 'decline') return 'declined';
  }
  if (current === 'pending-admin' && actor === 'admin') {
    if (decision === 'approve') return 'approved';
    if (decision === 'reject') return 'rejected';
  }
  return null;
}

export function isAssignmentSwapOpen(status: AssignmentSwapStatus): boolean {
  return status === 'pending-target' || status === 'pending-admin';
}

export function assignmentContactForUser(
  user: SessionUser,
  contacts: AssignmentContact[],
): AssignmentContact | null {
  return contacts.find((contact) => contact.status !== 'declined' && personIdentityMatches(contact, user)) ?? null;
}

export function rolePersonType(role: PlanningRole): PersonType {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

/** Un utilisateur EST la personne assignable : "lié" à personId signifie juste être cette personne. */
export function userHasPersonLink(
  user: { id: number },
  _personType: PersonType,
  personId: number,
): boolean {
  return user.id === personId;
}

/**
 * Détermine si un échange ouvert n'est plus actionnable à partir de l'état publié.
 * Un simple changement du brouillon admin ne doit jamais expirer un échange encore
 * valide dans le snapshot publié.
 */
export function shouldExpireAssignmentSwap(
  payload: AssignmentSwapPayload,
  snapshot: PlanningEventSnapshot | null,
  now = Date.now(),
  timeZone = 'UTC',
): boolean {
  if (!isAssignmentSwapOpen(payload.status)) return false;
  if (!snapshot || !isVisiblePublicationStatus(snapshot.planningStatus)) return true;

  const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
  if (start === null || start <= now) return true;

  const requesterStillAssigned = snapshot.assignments[payload.role].some((contact) =>
    contact.status !== 'declined'
    && contact.personType === payload.requester.personType
    && contact.personId === payload.requester.personId);

  return !requesterStillAssigned;
}
