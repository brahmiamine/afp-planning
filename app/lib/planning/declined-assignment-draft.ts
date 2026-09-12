import type { DataSource } from 'typeorm';
import { contactIdentity } from './assignment-contacts';
import { hydratePlanningAssignmentStates } from './assignment-state-overlay';
import { propagateAssignmentChangesIfPublished } from './assignment-propagation';
import { contactMatchesDeclinedPerson } from './declined-assignment';
import { isPlanningEventCurrentlyPublished } from './event-lifecycle';
import {
  getPlanningEventSnapshot,
  PlanningConcurrencyError,
  savePlanningPublication,
  saveRoleAssignments,
  type PlanningEventType,
  type PlanningRole,
} from './event-store';
import { assignmentStatus } from './p0-rules';
import { listPublishedPlanningEventSnapshots } from './published-planning';

const PLANNING_ROLES: PlanningRole[] = ['arbitre', 'encadrant', 'accompagnateur'];

/**
 * Retire du brouillon live la personne qui vient de refuser, puis marque l'événement
 * `modified` s'il est déjà publié — pour que le poste apparaisse vacant et que la
 * prochaine publication emporte le retrait.
 */
export async function vacateDeclinedAssignmentFromWorkingDraft(
  db: DataSource,
  clubId: string,
  eventType: PlanningEventType,
  eventId: string,
  role: PlanningRole,
  declinedPerson: { id?: number | null; nom: string },
): Promise<boolean> {
  const live = await getPlanningEventSnapshot(db, eventType, eventId);
  if (!live) return false;

  const before = live.assignments[role] ?? [];
  const after = before.filter((contact) => !contactMatchesDeclinedPerson(contact, declinedPerson));

  if (after.length !== before.length) {
    await saveRoleAssignments(db, live, role, after);
    await propagateAssignmentChangesIfPublished(db, clubId, live, before, after);
    return true;
  }

  return markPublishedEventModified(db, clubId, eventType, eventId);
}

async function markPublishedEventModified(
  db: DataSource,
  clubId: string,
  eventType: PlanningEventType,
  eventId: string,
): Promise<boolean> {
  const published = await isPlanningEventCurrentlyPublished(db, clubId, eventType, eventId);
  if (!published) return false;
  const refreshed = await getPlanningEventSnapshot(db, eventType, eventId);
  if (!refreshed || refreshed.planningStatus === 'modified') return false;
  await savePlanningPublication(db, refreshed, {
    planningStatus: 'modified',
    modifiedAfterPublishAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Harmonise le brouillon avec les refus déjà enregistrés sur le snapshot publié
 * (réponses antérieures à la mise à jour du flux de refus). Idempotent.
 */
export async function vacateDeclinedAssignmentsFromWorkingDraft(
  db: DataSource,
  clubId: string,
): Promise<number> {
  const published = await listPublishedPlanningEventSnapshots(db, clubId);
  if (!published?.length) return 0;

  const hydrated = await hydratePlanningAssignmentStates(db, published, clubId);
  let vacated = 0;

  for (const snapshot of hydrated) {
    for (const role of PLANNING_ROLES) {
      const seen = new Set<string>();
      for (const contact of snapshot.assignments[role]) {
        if (assignmentStatus(contact) !== 'declined') continue;
        const key = contactIdentity(contact);
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const removed = await vacateDeclinedAssignmentFromWorkingDraft(
            db,
            clubId,
            snapshot.eventType,
            snapshot.eventId,
            role,
            { id: contact.personId, nom: contact.nom },
          );
          if (removed) vacated += 1;
        } catch (error) {
          if (error instanceof PlanningConcurrencyError) continue;
          throw error;
        }
      }
    }
  }

  return vacated;
}
