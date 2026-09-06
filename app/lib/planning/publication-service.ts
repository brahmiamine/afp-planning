import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { logAuditEntry } from '@/lib/db/audit-log';
import { notifyContact } from '@/lib/notifications/service';
import { assignmentStatus } from './p0-rules';
import { savePlanningPublication, type PlanningEventSnapshot, type PlanningRole } from './event-store';
import {
  getPublishedPlanningEventSnapshot,
  patchPublishedPlanningEvent,
} from './published-planning';

/**
 * "Publier" a été retiré de ce chemin par-événement : il ne faisait que basculer le
 * champ planningStatus local sur published/draft, sans jamais toucher le snapshot
 * global (published-planning) que lisent /mon-planning, l'iCal et les échanges — la
 * notification "Planning publié" qu'il envoyait était donc trompeuse, puisque rien ne
 * devenait réellement visible. La seule publication qui compte est désormais globale :
 * publishGlobalPlanning (app/lib/planning/global-publication.ts).
 *
 * "cancel"/"reopen" restent nécessaires : ils posent le drapeau que publishGlobalPlanning
 * lit pour exclure un événement de la prochaine publication globale. Aucune notification
 * n'est envoyée ici pour "cancel" — l'annulation ne devient réellement visible qu'à la
 * prochaine publication globale, moment où publishGlobalPlanning notifie les personnes
 * concernées.
 *
 * "reopen" est l'exception symétrique (issue #71) : pour un événement précédemment publié
 * puis annulé, rester en `draft` le ferait disparaître de « Mon planning » sans aucune
 * notification — alors que l'annulation, elle, est communiquée. La réouverture restaure
 * donc un statut visible (`modified`), rend l'événement immédiatement visible à nouveau
 * dans le snapshot publié et notifie les personnes affectées.
 */
export type PlanningPublicationAction = 'cancel' | 'reopen';

const REOPEN_NOTIFY_ROLES: PlanningRole[] = ['arbitre', 'encadrant', 'accompagnateur'];

function contactKey(contact: { personId?: number; personType?: string; nom: string }): string {
  return contact.personId !== undefined && contact.personType
    ? `${contact.personType}:${contact.personId}`
    : contact.nom.trim().toLowerCase();
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

  // Réouverture d'un événement publié puis annulé : on restaure un statut visible pour
  // qu'il réapparaisse immédiatement, avec mention « modifié », au lieu de disparaître
  // silencieusement en brouillon (issue #71).
  const publishedSnapshot = action === 'reopen'
    ? await getPublishedPlanningEventSnapshot(db, snapshot.eventType, snapshot.eventId)
    : null;
  const reopenPublishedCancelled = publishedSnapshot?.planningStatus === 'cancelled';

  const patch: Record<string, unknown> = action === 'cancel'
    ? {
      planningStatus: 'cancelled',
      cancelledAt: now,
      cancelledByUserId: user.id,
      cancellationReason: reason || 'Annulé par le responsable du planning',
    }
    : {
      planningStatus: reopenPublishedCancelled ? 'modified' : 'draft',
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    };

  await savePlanningPublication(db, snapshot, patch);
  await logAuditEntry(db, {
    user,
    entityType: 'PlanningPublication',
    entityId: `${snapshot.eventType}:${snapshot.eventId}`,
    action,
    before: { planningStatus: beforeStatus },
    after: patch,
  });

  if (action === 'reopen' && reopenPublishedCancelled && publishedSnapshot) {
    // L'événement redevient immédiatement visible dans le snapshot publié : « publié »
    // est la source de vérité des utilisateurs, attendre la prochaine publication
    // globale laisserait un événement rouvert invisible.
    const restored: PlanningEventSnapshot = { ...snapshot, planningStatus: 'modified' };
    await patchPublishedPlanningEvent(db, user.clubId, restored);

    // Notification des personnes affectées (dédoublonnée par personne, refus exclus :
    // un refus n'a pas à être relancé sur un événement qu'il a décliné).
    const notified = new Set<string>();
    for (const role of REOPEN_NOTIFY_ROLES) {
      for (const contact of publishedSnapshot.assignments[role] ?? []) {
        if (assignmentStatus(contact) === 'declined') continue;
        const key = contactKey(contact);
        if (notified.has(key)) continue;
        notified.add(key);
        await notifyContact(db, contact, {
          type: 'planning-published-reopened',
          title: 'Événement rouvert',
          message: `Événement rouvert : ${publishedSnapshot.title} (${publishedSnapshot.date} ${publishedSnapshot.time}) est de nouveau au planning.`,
          eventType: snapshot.eventType,
          eventId: snapshot.eventId,
        });
      }
    }
  }

  return String(patch.planningStatus);
}
