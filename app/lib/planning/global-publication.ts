import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type { AssignmentContact } from '@/types/match';
import type { UserEntity } from '@/lib/db/schemas';
import { logAuditEntry } from '@/lib/db/audit-log';
import { notifyContact } from '@/lib/notifications/service';
import {
  listPlanningEventSnapshots,
  savePlanningPublication,
  type PlanningEventSnapshot,
  type PlanningRole,
} from './event-store';
import {
  assessPublicationReadiness,
  PlanningValidationError,
  validateAssignmentSet,
} from './validation';
import { readAppSettings } from '@/lib/settings-store';
import {
  getPublishedPlanning,
  planningPublicationDiff,
  savePublishedPlanning,
  type PlanningPublicationDiff,
} from './published-planning';

function rolesFor(snapshot: PlanningEventSnapshot): PlanningRole[] {
  return snapshot.eventType === 'officiel' || snapshot.eventType === 'amical'
    ? ['arbitre', 'encadrant', 'accompagnateur']
    : ['encadrant'];
}

function uniqueContacts(snapshots: PlanningEventSnapshot[]): AssignmentContact[] {
  const contacts = new Map<string, AssignmentContact>();
  for (const snapshot of snapshots) {
    for (const roleContacts of Object.values(snapshot.assignments)) {
      for (const contact of roleContacts) {
        if (contact.status === 'declined') continue;
        const key = contact.personType && contact.personId !== undefined
          ? `${contact.personType}:${contact.personId}`
          : `name:${contact.nom.trim().toLowerCase()}`;
        contacts.set(key, contact);
      }
    }
  }
  return [...contacts.values()];
}

export interface GlobalPlanningPublicationPreview {
  lastPublishedAt: string | null;
  diff: PlanningPublicationDiff;
}

export async function getGlobalPlanningPublicationPreview(
  db: DataSource,
): Promise<GlobalPlanningPublicationPreview> {
  const [current, published] = await Promise.all([
    listPlanningEventSnapshots(db),
    getPublishedPlanning(db),
  ]);
  return {
    lastPublishedAt: published?.publishedAt ?? null,
    diff: planningPublicationDiff(current, published?.events ?? []),
  };
}

export async function publishGlobalPlanning(
  db: DataSource,
  user: SessionUser,
): Promise<GlobalPlanningPublicationPreview> {
  const settings = await readAppSettings(db, user.clubId);
  if (settings.features.adminPublicationApproval && !user.roles.includes('admin')) {
    throw new PlanningValidationError('La publication finale doit être approuvée par un administrateur.', [{
      code: 'admin-approval-required',
      message: 'Ce planning est prêt mais sa publication doit être validée par un administrateur.',
    }]);
  }
  const before = await getPublishedPlanning(db);
  const current = await listPlanningEventSnapshots(db);
  const candidates = current.filter((snapshot) => snapshot.planningStatus !== 'cancelled');

  const blockers: Array<{ code: string; message: string }> = [];
  if (settings.features.publicationReadiness) {
    const requirements = {
      arbitre: settings.features.requireArbitreForPublication,
      encadrant: settings.features.requireEncadrantForPublication,
      accompagnateur: settings.features.requireAccompagnateurForPublication,
    };
    for (const snapshot of candidates) {
      const readiness = assessPublicationReadiness(snapshot, requirements);
      for (const blocker of readiness.blockers) {
        blockers.push({
          code: `${snapshot.eventType}:${snapshot.eventId}:${blocker.code}`,
          message: `${snapshot.title} — ${blocker.message}`,
        });
      }
    }
  }

  if (settings.features.assignmentValidation) {
    const users = await db.getRepository<UserEntity>('User').find({ where: { clubId: user.clubId } });
    const validationSnapshots = candidates.map((snapshot) => ({ ...snapshot, planningStatus: 'published' as const }));
    for (const snapshot of candidates) {
      for (const role of rolesFor(snapshot)) {
        const people = users
          .filter((candidate) => candidate.roles.includes(role))
          .map((candidate) => ({
            id: candidate.id,
            nom: candidate.nom,
            indisponibilites: candidate.indisponibilites ?? [],
          }));
        const violations = validateAssignmentSet({
          target: { ...snapshot, planningStatus: 'published' },
          role,
          contacts: snapshot.assignments[role],
          people,
          snapshots: validationSnapshots,
        });
        for (const violation of violations) {
          blockers.push({
            code: `${snapshot.eventType}:${snapshot.eventId}:${role}:${violation.code}`,
            message: `${snapshot.title} — ${violation.message}`,
          });
        }
      }
    }
  }

  if (blockers.length) {
    throw new PlanningValidationError(
      'Le planning contient des éléments à corriger avant publication.',
      blockers,
    );
  }

  const publishedAt = new Date().toISOString();
  for (const snapshot of candidates) {
    await savePlanningPublication(db, snapshot, {
      planningStatus: 'published',
      publishedAt,
      publishedByUserId: user.id,
      modifiedAfterPublishAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    });
  }

  const refreshed = await listPlanningEventSnapshots(db);
  const payload = await savePublishedPlanning(db, user, refreshed, publishedAt);

  const diff = planningPublicationDiff(refreshed, before?.events ?? []);
  await logAuditEntry(db, {
    user,
    entityType: 'PlanningPublication',
    entityId: 'global',
    action: 'publish',
    before: before ? {
      publishedAt: before.publishedAt,
      events: before.events.length,
    } : null,
    after: {
      publishedAt: payload.publishedAt,
      events: payload.events.length,
      diff,
    },
  });

  const contacts = uniqueContacts([...(before?.events ?? []), ...payload.events]);
  await Promise.all(contacts.map((contact) => notifyContact(db, contact, {
    type: 'planning-published',
    title: 'Planning publié',
    message: `Le planning du club a été publié (${payload.events.length} événement(s)).`,
  })));

  return {
    lastPublishedAt: payload.publishedAt,
    diff,
  };
}
