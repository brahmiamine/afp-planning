import type { DataSource, EntityManager } from 'typeorm';
import type { AssignmentContact, PersonType } from '@/types/match';
import type { SessionUser } from '@/lib/auth/session';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import type { PlanningEventType, PlanningRole } from './event-store';
import { getPlanningEventSnapshot } from './event-store';
import { listPublishedPlanningEventSnapshots } from './published-planning';
import { hydratePlanningAssignmentStates } from './assignment-state-overlay';
import { eventStartTimestamp, isVisiblePublicationStatus } from './p0-rules';
import {
  getPlanningRecordForUpdate,
  listPlanningRecords,
  savePlanningRecordIfStatus,
  type PlanningRecord,
  type PlanningRecordKind,
} from './records';
import { personIdentityMatches } from './person-link';

export type AssignmentSwapStatus = 'pending-target' | 'pending-admin' | 'declined' | 'approved' | 'rejected' | 'cancelled';
// 'requester' (annulation par le demandeur) et 'system' (clôture automatique des
// demandes caduques, issue #81) rejoignent 'target'/'admin' ici (issue #285) : un seul
// acteur autorise l'annulation, l'autre l'expiration, mais les deux aboutissent au même
// état — les distinguer permet de garder une trace d'audit fidèle à l'initiateur réel.
export type AssignmentSwapDecisionActor = 'target' | 'admin' | 'requester' | 'system';
export type AssignmentSwapDecision = 'accept' | 'decline' | 'approve' | 'reject' | 'cancel' | 'expire';

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

/**
 * Unique source de vérité pour les transitions autorisées d'une demande d'échange
 * (issue #285) : chaque point d'entrée (réponse de la cible, décision admin, annulation
 * par le demandeur, clôture automatique) appelle cette même fonction plutôt que
 * d'assigner un nouveau statut à la main — un acteur ne peut jamais produire une
 * transition qui ne lui est pas explicitement autorisée ici.
 */
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
  if (isAssignmentSwapOpen(current)) {
    if (actor === 'requester' && decision === 'cancel') return 'cancelled';
    if (actor === 'system' && decision === 'expire') return 'cancelled';
  }
  return null;
}

export function isAssignmentSwapOpen(status: AssignmentSwapStatus): boolean {
  return status === 'pending-target' || status === 'pending-admin';
}

export class AssignmentSwapNotFoundError extends Error {
  constructor(message = 'Demande d’échange introuvable') {
    super(message);
    this.name = 'AssignmentSwapNotFoundError';
  }
}

/** Transition refusée par `nextAssignmentSwapStatus` : la demande a déjà été traitée
 * (par une décision concurrente ou une clôture automatique) depuis la dernière lecture
 * du client. Toujours mappée sur une réponse HTTP 409 déterministe (issue #285), jamais
 * un 500 générique. */
export class AssignmentSwapConflictError extends Error {
  constructor(message = 'Cette demande d’échange a déjà été traitée entre-temps.') {
    super(message);
    this.name = 'AssignmentSwapConflictError';
  }
}

/** Échec d'une règle métier constatée après verrouillage (événement dépublié, personne
 * plus éligible…) — distinct d'`AssignmentSwapConflictError` bien que mappé sur un statut
 * HTTP proche (409 par défaut, parfois 404 — ex. événement introuvable), pour un message
 * d'erreur fidèle à la cause réelle. */
export class AssignmentSwapValidationError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'AssignmentSwapValidationError';
    this.status = status;
  }
}

/**
 * Verrouille la ligne d'échange (`getPlanningRecordForUpdate`, à l'intérieur d'une
 * transaction), vérifie via `nextAssignmentSwapStatus` que le statut lu autorise encore
 * la décision demandée, laisse `mutate` appliquer les effets métier propres à la
 * transition (affectation, snapshot publié, audit, notifications…) DANS LA MÊME
 * transaction, puis persiste le nouveau statut avec une écriture conditionnelle
 * (`WHERE status = <lu>`) comme filet de sécurité (issue #285).
 *
 * Le verrou pessimiste est la garantie primaire de sérialisation : deux décisions
 * concurrentes sur le même échange ne peuvent jamais toutes deux réussir — la seconde à
 * obtenir le verrou relit un statut déjà changé par la première et échoue avec
 * `AssignmentSwapConflictError`, jamais un 500 générique ni un état incohérent entre le
 * statut de la demande et l'affectation effectivement appliquée.
 */
export async function transitionAssignmentSwap<T>(
  db: DataSource,
  recordId: string,
  actor: AssignmentSwapDecisionActor,
  decision: AssignmentSwapDecision,
  mutate: (
    manager: EntityManager,
    record: PlanningRecord<AssignmentSwapPayload>,
    nextStatus: AssignmentSwapStatus,
  ) => Promise<{ payload: AssignmentSwapPayload; result: T }>,
): Promise<T> {
  return db.transaction(async (manager) => {
    const record = await getPlanningRecordForUpdate<AssignmentSwapPayload>(manager, recordId);
    if (!record || record.kind !== SWAP_KIND) throw new AssignmentSwapNotFoundError();
    const nextStatus = nextAssignmentSwapStatus(record.payload.status, actor, decision);
    if (!nextStatus) throw new AssignmentSwapConflictError();

    const { payload, result } = await mutate(manager, record, nextStatus);

    const updated = await savePlanningRecordIfStatus(manager, record.id, record.payload.status, payload);
    if (!updated) throw new AssignmentSwapConflictError();
    return result;
  });
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
  const publishedRaw = await listPublishedPlanningEventSnapshots(db);
  const published = publishedRaw
    ? await hydratePlanningAssignmentStates(db, publishedRaw, getCurrentClubId())
    : null;
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

    try {
      // Passe par le même verrou + la même transition conditionnelle que les décisions
      // humaines (issue #285) : si une décision concurrente (admin/cible/demandeur) a
      // déjà traité cette demande entre la lecture ci-dessus et cette tentative de
      // clôture, `AssignmentSwapConflictError` signale simplement que la clôture est
      // devenue inutile — ce n'est jamais une erreur de balayage.
      await transitionAssignmentSwap(db, record.id, 'system', 'expire', async (_manager, current, nextStatus) => ({
        payload: { ...current.payload, status: nextStatus },
        result: undefined,
      }));
      closed += 1;
    } catch (error) {
      if (!(error instanceof AssignmentSwapConflictError)) throw error;
    }
  }

  return closed;
}
