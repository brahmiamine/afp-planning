import type { AssignmentContact, PlanningPublicationStatus } from '@/types/match';

type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

/**
 * Helpers purs pour les cartes planning. Ce module doit rester importable depuis
 * un Client Component : aucun accès DB, notification ou nodemailer.
 */

export interface DeclinedAssignmentRef {
  nom: string;
  role: PlanningRole;
  personId?: number | null;
}

export function contactMatchesDeclinedPerson(
  contact: Pick<AssignmentContact, 'nom' | 'personId' | 'personType'>,
  person: { id?: number | null; nom: string },
): boolean {
  if (person.id != null && contact.personId != null) {
    return contact.personId === person.id;
  }
  return contact.nom.trim().toLowerCase() === person.nom.trim().toLowerCase();
}

export function contactMatchesDeclinedRef(
  contact: Pick<AssignmentContact, 'nom' | 'personId'>,
  declined: DeclinedAssignmentRef,
  role: PlanningRole,
): boolean {
  if (declined.role !== role) return false;
  if (declined.personId != null && contact.personId != null) {
    return declined.personId === contact.personId;
  }
  return contact.nom.trim().toLowerCase() === declined.nom.trim().toLowerCase();
}

export function isActiveAssignmentOnCard(
  contact: Pick<AssignmentContact, 'nom' | 'personId'> & { status?: string },
  role: PlanningRole,
  declinedContacts: DeclinedAssignmentRef[] = [],
): boolean {
  if (contact.status === 'declined') return false;
  return !declinedContacts.some((declined) => contactMatchesDeclinedRef(contact, declined, role));
}

export function filterActiveAssignments<T extends Pick<AssignmentContact, 'nom' | 'personId'> & { status?: string }>(
  contacts: T[] | undefined,
  role: PlanningRole,
  declinedContacts: DeclinedAssignmentRef[] = [],
): T[] {
  return (contacts ?? []).filter((contact) => isActiveAssignmentOnCard(contact, role, declinedContacts));
}

export function hasDeclinedAssignment(
  person: Pick<AssignmentContact, 'nom' | 'personId'>,
  role: PlanningRole,
  declinedContacts: DeclinedAssignmentRef[] = [],
): boolean {
  return declinedContacts.some((declined) => contactMatchesDeclinedRef(person, declined, role));
}

/**
 * Le statut le plus « avancé » gagne : une carte dont le brouillon est déjà modifié
 * (ou dont le dashboard vient de le marquer) ne doit pas rester affichée « Publié ».
 */
export function resolveDisplayedPlanningStatus(
  ...sources: Array<PlanningPublicationStatus | undefined>
): PlanningPublicationStatus | undefined {
  if (sources.includes('cancelled')) return 'cancelled';
  if (sources.includes('modified')) return 'modified';
  if (sources.includes('draft')) return 'draft';
  if (sources.includes('published')) return 'published';
  return sources.find((status): status is PlanningPublicationStatus => status != null);
}
