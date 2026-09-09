import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import { diffAssignmentContacts } from './assignment-contacts';
import { isPlanningEventCurrentlyPublished } from './event-lifecycle';
import type { PlanningEventSnapshot } from './event-store';
import { getPlanningEventSnapshot, savePlanningPublication } from './event-store';

/**
 * Une affectation initiée par un administrateur (manuelle ou auto-affectation) reste dans le
 * planning de travail jusqu'à la publication globale, au même titre qu'un changement de date
 * ou de lieu (issue #197) : elle ne doit ni apparaître dans `/mon-planning`, ni être notifiée,
 * avant que l'admin ne publie. Les réponses des personnes affectées (accepter/refuser) et les
 * remplacements validés (assignment-swaps) restent en revanche immédiats — ce ne sont pas des
 * décisions de préparation mais des confirmations sur un planning déjà visible.
 *
 * Si l'événement fait déjà partie du planning publié, cette fonction se contente donc de le
 * marquer `modified` (comme le ferait une modification structurelle) pour qu'il ressorte dans
 * l'aperçu de publication : la prochaine publication globale rendra le changement visible et
 * enverra les notifications ciblées (`publishGlobalPlanning`), une seule fois, au bon moment.
 *
 * Ne fait rien s'il n'y a aucune différence entre `before` et `after`, ou si l'événement n'a
 * jamais été publié (un brouillon jamais publié n'a rien à signaler avant sa première
 * publication).
 *
 * Renvoie `true` si l'événement était déjà publié (et donc marqué `modified` si besoin).
 */
export async function propagateAssignmentChangesIfPublished(
  db: DataSource,
  clubId: string,
  snapshot: PlanningEventSnapshot,
  before: AssignmentContact[] | undefined,
  after: AssignmentContact[] | undefined,
): Promise<boolean> {
  const diff = diffAssignmentContacts(before ?? [], after ?? []);
  if (diff.added.length === 0 && diff.removed.length === 0) return false;

  const publishedBefore = await isPlanningEventCurrentlyPublished(db, clubId, snapshot.eventType, snapshot.eventId);
  if (!publishedBefore) return false;

  const refreshed = await getPlanningEventSnapshot(db, snapshot.eventType, snapshot.eventId);
  if (!refreshed) return false;
  if (refreshed.planningStatus !== 'modified') {
    await savePlanningPublication(db, refreshed, {
      planningStatus: 'modified',
      modifiedAfterPublishAt: new Date().toISOString(),
    });
  }
  return true;
}
