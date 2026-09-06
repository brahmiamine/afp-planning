import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { logAuditEntry } from '@/lib/db/audit-log';
import { savePlanningPublication, type PlanningEventSnapshot } from './event-store';

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
 * n'est envoyée ici — l'annulation ne devient réellement visible qu'à la prochaine
 * publication globale, moment où computePerUserPublicationChanges notifie correctement
 * les personnes concernées.
 */
export type PlanningPublicationAction = 'cancel' | 'reopen';

export async function applyPlanningPublicationAction(
  db: DataSource,
  user: SessionUser,
  snapshot: PlanningEventSnapshot,
  action: PlanningPublicationAction,
  reason = '',
): Promise<string> {
  const now = new Date().toISOString();
  const beforeStatus = snapshot.planningStatus;
  const patch: Record<string, unknown> = action === 'cancel'
    ? {
      planningStatus: 'cancelled',
      cancelledAt: now,
      cancelledByUserId: user.id,
      cancellationReason: reason || 'Annulé par le responsable du planning',
    }
    : {
      planningStatus: 'draft',
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
  return String(patch.planningStatus);
}
