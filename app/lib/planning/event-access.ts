import type { SessionUser } from '@/lib/auth/session';
import { canEdit, isReadOnlyRole } from '@/lib/auth/roles';
import { personIdentityMatches } from './person-link';
import type { PlanningEventSnapshot } from './event-store';
import { eventStartTimestamp, isVisiblePublicationStatus } from './p0-rules';

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
): boolean {
  if (isPlanningAdmin(user)) return true;
  if (!isAssignedToPlanningEvent(user, snapshot)) return false;
  const start = eventStartTimestamp(snapshot.date, snapshot.time);
  return start !== null && start <= now;
}

export function canManagePlanningEventWorkspace(user: SessionUser): boolean {
  return isPlanningAdmin(user);
}
