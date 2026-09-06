import type { DataSource } from 'typeorm';
import type { AssignmentContact, PersonType } from '@/types/match';
import type { SessionUser } from '@/lib/auth/session';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import type { PlanningEventType, PlanningRole } from './event-store';
import { getPlanningEventSnapshot } from './event-store';
import { listPublishedPlanningEventSnapshots } from './published-planning';
import { eventStartTimestamp, isVisiblePublicationStatus } from './p0-rules';
import {
  listPlanningRecords,
  savePlanningRecord,
  type PlanningRecordKind,
} from './records';
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

const SWAP_KIND = 'assignment-swap' as PlanningRecordKind;

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

/** Le demandeur est-il toujours affecté (hors refus) au rôle de l'échange sur ce snapshot ? */
export function requesterStillAssigned(
  payload: Pick<AssignmentSwapPayload, 'role' | 'requester'>,
  snapshot: { assignments: Record<PlanningRole, AssignmentContact[]> },
): boolean {
  return (snapshot.assignments[payload.role] ?? []).some((contact) =>
    contact.status !== 'declined'
    && contact.personType === payload.requester.personType
    && contact.personId === payload.requester.personId);
}

/**
 * Clôture (`cancelled`) les demandes d'échange encore ouvertes dont l'événement est
 * devenu caduc : annulé ou dépublié, déjà commencé, ou affectation du demandeur retirée
 * (issue #81). Sans ce balayage, une demande `pending-*` restait affichée « en cours »
 * indéfiniment alors que l'échange n'était plus possible. Appelé au chargement des
 * listes (côté utilisateur et côté admin). Renvoie le nombre de demandes clôturées.
 */
export async function closeStaleAssignmentSwaps(db: DataSource, now = Date.now()): Promise<number> {
  const records = await listPlanningRecords<AssignmentSwapPayload>(db, { kind: SWAP_KIND }, 500);
  const open = records.filter((record) => isAssignmentSwapOpen(record.payload.status));
  if (!open.length) return 0;

  const { timeZone } = await readAppSettings(db, getCurrentClubId());
  const published = await listPublishedPlanningEventSnapshots(db);
  let closed = 0;

  for (const record of open) {
    const snapshot = published
      ? published.find((item) =>
          item.eventType === record.payload.eventType && item.eventId === record.payload.eventId) ?? null
      : await getPlanningEventSnapshot(db, record.payload.eventType, record.payload.eventId);

    let stale = false;
    if (!snapshot || !isVisiblePublicationStatus(snapshot.planningStatus)) {
      stale = true;
    } else if (!requesterStillAssigned(record.payload, snapshot)) {
      stale = true;
    } else {
      const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
      // Une date inexploitable n'est pas un motif de clôture automatique (déjà refusée
      // à la création) ; seul un début avéré clôture.
      if (start !== null && start <= now) stale = true;
    }
    if (!stale) continue;

    await savePlanningRecord(db, {
      id: record.id,
      kind: record.kind,
      eventType: record.eventType,
      eventId: record.eventId,
      ownerUserId: record.ownerUserId,
      payload: { ...record.payload, status: 'cancelled' },
    });
    closed += 1;
  }

  return closed;
}
