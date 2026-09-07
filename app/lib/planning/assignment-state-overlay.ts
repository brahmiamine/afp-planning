import type { DataSource, EntityManager } from 'typeorm';
import { getCurrentClubId } from '@/lib/auth/club-context';
import type { AssignmentContact } from '@/types/match';
import { ensureAssignmentStateBackfilled } from './assignment-state-backfill';
import {
  applyOperationalStateToContact,
  assignmentStatePersonKey,
  listAssignmentStatesForEvents,
  type AssignmentStateRow,
} from './assignment-state-store';
import type { PlanningEventSnapshot, PlanningRole } from './event-store';

type Queryable = DataSource | EntityManager;

function stateKey(
  eventType: PlanningEventSnapshot['eventType'],
  eventId: string,
  role: PlanningRole,
  personKey: string,
): string {
  return `${eventType}:${eventId}:${role}:${personKey}`;
}

/**
 * Superpose l'état mutable indépendant sur la structure d'un snapshot publié.
 * L'absence d'une ligne conserve le contact structurel : ce cas n'arrive normalement
 * que pendant le tout premier backfill ou pour une affectation pas encore publiée.
 */
export function applyAssignmentStatesToSnapshots(
  snapshots: PlanningEventSnapshot[],
  rows: AssignmentStateRow[],
): PlanningEventSnapshot[] {
  const byKey = new Map(rows.map((row) => [
    stateKey(row.eventType, row.eventId, row.role, row.personKey),
    row.state,
  ]));

  const apply = (
    snapshot: PlanningEventSnapshot,
    role: PlanningRole,
    contact: AssignmentContact,
  ): AssignmentContact => {
    const state = byKey.get(stateKey(
      snapshot.eventType,
      snapshot.eventId,
      role,
      assignmentStatePersonKey(contact),
    ));
    return state ? applyOperationalStateToContact(contact, state) : contact;
  };

  return snapshots.map((snapshot) => {
    const assignments = {
      arbitre: snapshot.assignments.arbitre.map((contact) => apply(snapshot, 'arbitre', contact)),
      encadrant: snapshot.assignments.encadrant.map((contact) => apply(snapshot, 'encadrant', contact)),
      accompagnateur: snapshot.assignments.accompagnateur.map((contact) => apply(snapshot, 'accompagnateur', contact)),
    };
    const event = snapshot.eventType === 'entrainement' || snapshot.eventType === 'plateau'
      ? { ...snapshot.event, encadrants: assignments.encadrant }
      : snapshot.event;
    const extras = snapshot.extras
      ? {
          ...snapshot.extras,
          arbitreTouche: assignments.arbitre,
          contactEncadrants: assignments.encadrant,
          contactAccompagnateur: assignments.accompagnateur,
        }
      : null;
    return { ...snapshot, event, extras, assignments };
  });
}

/** Charge en une requête l'état de tous les événements puis l'applique aux snapshots. */
export async function hydratePlanningAssignmentStates(
  db: Queryable,
  snapshots: PlanningEventSnapshot[],
  clubId = getCurrentClubId(),
): Promise<PlanningEventSnapshot[]> {
  if (snapshots.length === 0) return [];
  await ensureAssignmentStateBackfilled(db, clubId);
  const rows = await listAssignmentStatesForEvents(
    db,
    snapshots.map(({ eventType, eventId }) => ({ eventType, eventId })),
    clubId,
  );
  return applyAssignmentStatesToSnapshots(snapshots, rows);
}

/** Variante pratique qui préserve la sémantique `null` = jamais publié. */
export async function hydratePublishedPlanningAssignmentStates(
  db: Queryable,
  snapshots: PlanningEventSnapshot[] | null,
  clubId = getCurrentClubId(),
): Promise<PlanningEventSnapshot[] | null> {
  return snapshots === null ? null : hydratePlanningAssignmentStates(db, snapshots, clubId);
}
