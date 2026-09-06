import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { canEdit, isReadOnlyRole } from '@/lib/auth/roles';
import { personIdentityMatches } from './person-link';
import { getPlanningEventSnapshot, type PlanningEventSnapshot, type PlanningEventType } from './event-store';
import { eventStartTimestamp, isVisiblePublicationStatus } from './p0-rules';
import { listPublishedPlanningEventSnapshots } from './published-planning';

export function isPlanningAdmin(user: SessionUser): boolean {
  return canEdit(user.roles);
}

export function isAssignedToPlanningEvent(user: SessionUser, snapshot: PlanningEventSnapshot): boolean {
  if (!isReadOnlyRole(user.roles)) return false;
  return Object.values(snapshot.assignments).some((contacts) =>
    contacts.some((contact) => personIdentityMatches(contact, user)),
  );
}

export function canReadPlanningEventWorkspace(user: SessionUser, snapshot: PlanningEventSnapshot): boolean {
  if (isPlanningAdmin(user)) return true;
  return isVisiblePublicationStatus(snapshot.planningStatus) && isAssignedToPlanningEvent(user, snapshot);
}

export function canCommentOnPlanningEvent(user: SessionUser, snapshot: PlanningEventSnapshot): boolean {
  return canReadPlanningEventWorkspace(user, snapshot);
}

export function canSubmitPostEventReport(
  user: SessionUser,
  snapshot: PlanningEventSnapshot,
  now = Date.now(),
  /** Fuseau horaire du club pour le contrôle du début d'événement (issue #45). */
  timeZone = 'UTC',
): boolean {
  if (isPlanningAdmin(user)) return true;
  if (!isAssignedToPlanningEvent(user, snapshot)) return false;
  const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
  return start !== null && start <= now;
}

export function canManagePlanningEventWorkspace(user: SessionUser): boolean {
  return isPlanningAdmin(user);
}

/**
 * Résout l'événement à utiliser pour vérifier l'accès d'un compte personnel aux
 * sous-fonctionnalités (collaboration, rapports, pièces jointes, météo) : ces comptes
 * ne doivent jamais voir leur accès dépendre du brouillon de travail de l'admin, qui peut
 * diverger du planning publié tant qu'il n'a pas été republié. Un admin continue de
 * travailler sur la copie live. `listPublishedPlanningEventSnapshots` renvoie `null` aussi
 * bien quand le club n'a encore jamais publié de planning global que si le snapshot stocké
 * est illisible (payload corrompu) : dans les deux cas on retombe ici sur la copie live,
 * comme le fait déjà chaque autre lecteur de ce snapshot (route iCal, réponse d'affectation).
 */
export async function resolvePlanningEventForAccess(
  db: DataSource,
  user: SessionUser,
  eventType: PlanningEventType,
  eventId: string,
): Promise<PlanningEventSnapshot | null> {
  if (isPlanningAdmin(user)) {
    return getPlanningEventSnapshot(db, eventType, eventId);
  }
  const publishedSnapshots = await listPublishedPlanningEventSnapshots(db);
  if (!publishedSnapshots) {
    return getPlanningEventSnapshot(db, eventType, eventId);
  }
  return publishedSnapshots.find((snapshot) => snapshot.eventType === eventType && snapshot.eventId === eventId) ?? null;
}
