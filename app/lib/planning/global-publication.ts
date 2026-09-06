import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
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
  applyReconfirmationResets,
  computePerUserPublicationChanges,
  eventKey,
  getPublishedPlanning,
  planningPublicationDiff,
  savePublishedPlanning,
  type PlanningPublicationDiff,
  type PublicationChangeKind,
  type ReconfirmationReset,
} from './published-planning';

const CHANGE_TITLES: Record<PublicationChangeKind, string> = {
  added: 'Nouvelle affectation',
  removed: 'Affectation supprimée',
  rescheduled: 'Horaire modifié',
  cancelled: 'Événement annulé',
};

function contactIdentity(contact: { personId?: number; personType?: string; nom: string }): string {
  return contact.personId !== undefined && contact.personType
    ? `${contact.personType}:${contact.personId}`
    : contact.nom.trim().toLowerCase();
}

function resetKey(reset: ReconfirmationReset): string {
  // Une personne qui change de rôle reste affectée au même événement : le dédoublonnage
  // ne doit pas dépendre du rôle, sinon elle reçoit aussi une fausse notification "supprimée".
  return `${reset.eventType}:${reset.eventId}:${contactIdentity(reset.contact)}`;
}

function rolesFor(snapshot: PlanningEventSnapshot): PlanningRole[] {
  return snapshot.eventType === 'officiel' || snapshot.eventType === 'amical'
    ? ['arbitre', 'encadrant', 'accompagnateur']
    : ['encadrant'];
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
      message: 'La publication du planning doit être validée par un administrateur.',
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

  // Une affectation déjà acceptée/refusée sur la publication précédente ne doit jamais être
  // reconduite telle quelle si les conditions matérielles de l'événement (date, heure, lieu,
  // horaire de rendez-vous) ou le rôle de la personne ont changé depuis : on la remet à `pending`
  // avant d'écrire ce nouveau candidat, et on retient qui doit être notifié pour reconfirmer.
  const publishedAt = new Date().toISOString();
  const beforeByKey = new Map((before?.events ?? []).map((snapshot) => [eventKey(snapshot), snapshot]));
  const allResets: ReconfirmationReset[] = [];
  const candidatesToPublish = candidates.map((candidate) => {
    const { snapshot, resets } = applyReconfirmationResets(beforeByKey.get(eventKey(candidate)), candidate, publishedAt);
    allResets.push(...resets);
    return snapshot;
  });

  // Toutes les écritures (statuts par événement + snapshot global) dans une seule
  // transaction DB : soit le nouveau planning complet devient visible, soit rien ne
  // change. Une erreur sur un seul événement (concurrence, contrainte DB, etc.) fait
  // échouer et annule l'ensemble — jamais de publication partielle.
  // Les événements annulés déjà communiqués restent dans le snapshot publié avec le statut
  // `cancelled` afin de ne pas disparaître silencieusement du planning utilisateur.
  const previouslyPublishedKeys = new Set((before?.events ?? []).map(eventKey));

  const { refreshed, payload } = await db.transaction(async (manager) => {
    for (const snapshot of candidatesToPublish) {
      const patch: Record<string, unknown> = {
        planningStatus: 'published',
        publishedAt,
        publishedByUserId: user.id,
        modifiedAfterPublishAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
      };
      if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
        patch.arbitreTouche = snapshot.assignments.arbitre;
        patch.contactEncadrants = snapshot.assignments.encadrant;
        patch.contactAccompagnateur = snapshot.assignments.accompagnateur;
      } else {
        patch.encadrants = snapshot.assignments.encadrant;
      }
      await savePlanningPublication(manager, snapshot, patch);
    }

    const refreshedInTx = await listPlanningEventSnapshots(manager);
    const publishedPayload = await savePublishedPlanning(
      manager,
      user,
      refreshedInTx,
      publishedAt,
      previouslyPublishedKeys,
    );
    return { refreshed: refreshedInTx, payload: publishedPayload };
  });

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

  // Un message générique unique enverrait "Planning publié" même à quelqu'un dont rien
  // n'a changé, et ne dirait jamais à une personne retirée qu'elle l'a été. Chaque
  // changement structurel réel donne lieu à un message ciblé ; personne n'est notifié
  // pour un événement qu'elle continue de voir à l'identique.
  //
  // Un contact remis à `pending` par `applyReconfirmationResets` reçoit un message dédié
  // "merci de reconfirmer" plutôt que le message générique "horaire modifié" : on retire
  // ces cas du diff générique pour éviter une double notification sur le même événement.
  const resetKeys = new Set(allResets.map((reset) => resetKey(reset)));
  const changes = computePerUserPublicationChanges(before?.events ?? [], payload.events, refreshed)
    .filter((change) => !resetKeys.has(`${change.eventType}:${change.eventId}:${contactIdentity(change.contact)}`));
  await Promise.all(changes.map((change) => notifyContact(db, change.contact, {
    type: `planning-published-${change.kind}`,
    title: CHANGE_TITLES[change.kind],
    message: change.message,
    eventType: change.eventType,
    eventId: change.eventId,
  })));

  const candidateByKey = new Map(candidatesToPublish.map((snapshot) => [eventKey(snapshot), snapshot]));
  await Promise.all(allResets.map((reset) => {
    const snapshot = candidateByKey.get(`${reset.eventType}:${reset.eventId}`);
    return notifyContact(db, reset.contact, {
      type: 'planning-published-reconfirmation-required',
      title: 'Confirmation requise',
      message: snapshot
        ? `Le planning a changé pour ${snapshot.title} (${snapshot.date} ${snapshot.time}) : merci de confirmer à nouveau votre présence.`
        : 'Le planning a changé : merci de confirmer à nouveau votre présence.',
      eventType: reset.eventType,
      eventId: reset.eventId,
    });
  }));

  return {
    lastPublishedAt: payload.publishedAt,
    diff,
  };
}
