import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import { logAuditEntry } from '@/lib/db/audit-log';
import { getPlanningEventSnapshot, savePlanningPublication, type PlanningEventSnapshot } from './event-store';
import { patchPublishedPlanningEvent } from './published-planning';

/**
 * "Publier" a été retiré de ce chemin par-événement : il ne faisait que basculer le
 * champ planningStatus local sur published/draft, sans jamais toucher le snapshot
 * global (published-planning) que lisent /mon-planning, l'iCal et les échanges — la
 * notification "Planning publié" qu'il envoyait était donc trompeuse, puisque rien ne
 * devenait réellement visible. La seule publication qui compte est désormais globale :
 * publishGlobalPlanning (app/lib/planning/global-publication.ts).
 *
 * "cancel"/"reopen" mettent à jour le brouillon **et** le snapshot publié déjà en place
 * (issue #392), comme l'archivage, pour que Mon Planning / iCal / partage public
 * reflètent immédiatement l'annulation ou la réouverture.
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

  // Le statut et son audit forment une seule mutation métier. Une panne d'audit ne doit
  // jamais laisser un événement annulé/réouvert sans trace correspondante (issue #275).
  await db.transaction(async (manager) => {
    await savePlanningPublication(manager, snapshot, patch);
    await logAuditEntry(manager, {
      user,
      entityType: 'PlanningPublication',
      entityId: `${snapshot.eventType}:${snapshot.eventId}`,
      action,
      before: { planningStatus: beforeStatus },
      after: patch,
    });
  });

  const updated = await getPlanningEventSnapshot(db, snapshot.eventType, snapshot.eventId);
  if (updated) {
    await patchPublishedPlanningEvent(db, user.clubId, updated);
  }

  return String(patch.planningStatus);
}
