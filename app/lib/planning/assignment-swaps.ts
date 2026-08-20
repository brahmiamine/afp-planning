import type { AssignmentContact, PersonType } from '@/types/match';
import type { SessionUser } from '@/lib/auth/session';
import type { PlanningEventType, PlanningRole } from './event-store';
import { personIdentityMatches } from './person-link';

export type AssignmentSwapStatus = 'pending-target' | 'pending-admin' | 'declined' | 'approved' | 'rejected' | 'cancelled';
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

export function userHasPersonLink(
  user: { id: number; personLinks?: Array<{ personType: string; personId: number; personNom: string }> },
  personType: PersonType,
  personId: number,
): boolean {
  return (user.personLinks ?? []).some((link) => link.personType === personType && link.personId === personId);
}
