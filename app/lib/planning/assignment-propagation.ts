import type { DataSource } from 'typeorm';
import { PLANNING_FUNCTION_LABELS } from '@/lib/auth/roles';
import type { AssignmentContact } from '@/types/match';
import { diffAssignmentContacts, notifyAssignmentChanges } from './assignment-contacts';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';
import { functionForPlanningRole } from './person-link';
import { patchPublishedPlanningEventAssignments } from './published-planning';

/**
 * Propage immédiatement un changement d'affectations vers le planning publié et notifie
 * les personnes ajoutées/retirées — sans attendre la prochaine publication globale
 * (issue #161), à l'image du remplacement validé dans assignment-swaps.
 *
 * Ne fait rien (et renvoie `false`) si l'événement n'est pas dans le snapshot publié :
 * une affectation posée sur un brouillon jamais publié ne doit être ni visible ni
 * notifiée avant la première publication globale (issue #146).
 *
 * Seules les affectations sont propagées : les autres champs du brouillon (date, lieu…)
 * restent soumis à la publication globale, pour ne pas publier par effet de bord des
 * modifications structurelles encore en préparation.
 */
export async function propagateAssignmentChangesIfPublished(
  db: DataSource,
  clubId: string,
  snapshot: PlanningEventSnapshot,
  role: PlanningRole,
  before: AssignmentContact[] | undefined,
  after: AssignmentContact[] | undefined,
): Promise<boolean> {
  const diff = diffAssignmentContacts(before ?? [], after ?? []);
  if (diff.added.length === 0 && diff.removed.length === 0) return false;

  const assignments = { ...snapshot.assignments, [role]: after ?? [] };
  const patched = await patchPublishedPlanningEventAssignments(
    db,
    clubId,
    snapshot.eventType,
    snapshot.eventId,
    assignments,
  );
  if (!patched) return false;

  await notifyAssignmentChanges(db, before, after, {
    eventType: snapshot.eventType,
    eventId: snapshot.eventId,
    roleLabel: PLANNING_FUNCTION_LABELS[functionForPlanningRole(role)],
    eventLabel: snapshot.title,
    date: snapshot.date,
    time: snapshot.time,
  });
  return true;
}
