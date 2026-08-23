import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { logAuditEntry } from '@/lib/db/audit-log';
import { notifyContact } from '@/lib/notifications/service';
import type { AssignmentContact } from '@/types/match';
import { savePlanningPublication, type PlanningEventSnapshot } from './event-store';
import { activeContacts } from './p0-rules';
import {
  assessPublicationReadiness,
  PlanningValidationError,
  requiredRolesForEvent,
  validateAssignmentsAgainstDatabase,
} from './validation';
import { isPlanningFeatureEnabled } from '@/lib/settings-store';

export type PlanningPublicationAction = 'draft' | 'publish' | 'cancel' | 'reopen';

function uniqueContacts(snapshot: PlanningEventSnapshot): AssignmentContact[] {
  const byKey = new Map<string, AssignmentContact>();
  for (const contacts of Object.values(snapshot.assignments)) {
    for (const contact of activeContacts(contacts)) {
      const key = contact.personType && contact.personId !== undefined
        ? `${contact.personType}:${contact.personId}`
        : `name:${contact.nom.trim().toLowerCase()}`;
      byKey.set(key, contact);
    }
  }
  return Array.from(byKey.values());
}

export async function applyPlanningPublicationAction(
  db: DataSource,
  user: SessionUser,
  snapshot: PlanningEventSnapshot,
  action: PlanningPublicationAction,
  reason = '',
): Promise<string> {
  const now = new Date().toISOString();
  const beforeStatus = snapshot.planningStatus;
  let patch: Record<string, unknown>;
  let notification: { type: string; title: string; message: string } | null = null;

  if (action === 'publish') {
    if (await isPlanningFeatureEnabled(db, user.clubId, 'adminPublicationApproval') && !user.roles.includes('admin')) {
      throw new PlanningValidationError('La publication finale doit être approuvée par un administrateur.', [{
        code: 'admin-approval-required',
        message: 'Enregistrez le planning en brouillon puis demandez sa publication à un administrateur.',
      }]);
    }
    if (await isPlanningFeatureEnabled(db, user.clubId, 'publicationReadiness')) {
      const readiness = assessPublicationReadiness(snapshot);
      if (!readiness.ready) {
        throw new PlanningValidationError('Le planning est incomplet et ne peut pas être publié.', readiness.blockers);
      }
    }
    if (await isPlanningFeatureEnabled(db, user.clubId, 'assignmentValidation')) {
      const violations = (await Promise.all(requiredRolesForEvent(snapshot).map((role) =>
        validateAssignmentsAgainstDatabase(db, snapshot, role, snapshot.assignments[role]),
      ))).flat();
      if (violations.length) {
        throw new PlanningValidationError('Le planning contient des affectations invalides.', violations);
      }
    }
    patch = {
      planningStatus: 'published',
      publishedAt: now,
      publishedByUserId: user.id,
      modifiedAfterPublishAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    };
    notification = { type: 'planning-published', title: 'Planning publié', message: `${snapshot.title} · ${snapshot.date} à ${snapshot.time}` };
  } else if (action === 'cancel') {
    patch = {
      planningStatus: 'cancelled',
      cancelledAt: now,
      cancelledByUserId: user.id,
      cancellationReason: reason || 'Annulé par le responsable du planning',
    };
    notification = { type: 'event-cancelled', title: 'Événement annulé', message: `${snapshot.title} · ${snapshot.date} à ${snapshot.time}${reason ? ` — ${reason}` : ''}` };
  } else {
    patch = {
      planningStatus: 'draft',
      ...(action === 'reopen' ? { cancelledAt: null, cancelledByUserId: null, cancellationReason: null } : {}),
    };
    if (beforeStatus === 'published' || beforeStatus === 'modified') {
      notification = { type: 'planning-draft', title: 'Planning en cours de modification', message: `${snapshot.title} a été temporairement repassé en brouillon.` };
    }
  }

  await savePlanningPublication(db, snapshot, patch);
  await logAuditEntry(db, {
    user,
    entityType: 'PlanningPublication',
    entityId: `${snapshot.eventType}:${snapshot.eventId}`,
    action,
    before: { planningStatus: beforeStatus },
    after: patch,
  });
  if (notification) {
    await Promise.all(uniqueContacts(snapshot).map((contact) => notifyContact(db, contact, {
      ...notification,
      eventType: snapshot.eventType,
      eventId: snapshot.eventId,
    })));
  }
  return String(patch.planningStatus);
}
