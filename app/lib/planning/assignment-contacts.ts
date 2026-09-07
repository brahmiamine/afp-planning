import type { DataSource } from 'typeorm';
import type { AssignmentContact, AssignmentStatus, Entrainement, PersonType, Plateau } from '@/types/match';
import { findAssignablePerson } from './person-link';
import { notifyContact } from '@/lib/notifications/service';
import type { PlanningEventSnapshot, PlanningEventType, PlanningRole } from './event-store';
import { listPublishedPlanningEventSnapshots, patchPublishedPlanningEvent } from './published-planning';
import { syncAssignmentStatesForRole } from './assignment-state-store';

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

export function contactIdentity(contact: AssignmentContact): string {
  if (contact.personType && contact.personId !== undefined) {
    return `${contact.personType}:${contact.personId}`;
  }
  return `name:${normalizedName(contact.nom)}`;
}

function isAssignmentStatus(value: unknown): value is AssignmentStatus {
  return value === 'pending' || value === 'accepted' || value === 'declined';
}

export async function enrichAssignmentContacts(
  db: DataSource,
  clubId: string,
  contacts: unknown,
  personType: PersonType,
  previousContacts: AssignmentContact[] = [],
): Promise<AssignmentContact[]> {
  const input = Array.isArray(contacts)
    ? contacts
    : contacts && typeof contacts === 'object'
      ? [contacts]
      : [];

  const previousByIdentity = new Map(previousContacts.map((contact) => [contactIdentity(contact), contact]));
  const output: AssignmentContact[] = [];

  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const nom = typeof raw.nom === 'string' ? raw.nom.trim() : '';
    if (!nom) continue;

    const rawPersonId = typeof raw.personId === 'number' && Number.isFinite(raw.personId) ? raw.personId : null;
    const person = await findAssignablePerson(db, clubId, personType, { personId: rawPersonId, personNom: nom });
    const candidate: AssignmentContact = {
      nom: person?.nom ?? nom,
      numero: typeof raw.numero === 'string' ? raw.numero.trim() : (person?.telephone ?? ''),
      ...(person ? { personId: person.id, personType } : {}),
    };

    const previous = previousByIdentity.get(contactIdentity(candidate))
      ?? previousContacts.find((contact) => normalizedName(contact.nom) === normalizedName(candidate.nom));

    candidate.status = previous?.status
      ?? (isAssignmentStatus(raw.status) ? raw.status : 'pending');
    candidate.assignedAt = previous?.assignedAt
      ?? (typeof raw.assignedAt === 'string' ? raw.assignedAt : new Date().toISOString());
    candidate.respondedAt = previous?.respondedAt
      ?? (typeof raw.respondedAt === 'string' ? raw.respondedAt : undefined);

    if (!output.some((contact) => contactIdentity(contact) === contactIdentity(candidate))) {
      output.push(candidate);
    }
  }

  return output;
}

export interface AssignmentDiff {
  added: AssignmentContact[];
  removed: AssignmentContact[];
}

export function diffAssignmentContacts(
  before: AssignmentContact[] = [],
  after: AssignmentContact[] = [],
): AssignmentDiff {
  const beforeKeys = new Set(before.map(contactIdentity));
  const afterKeys = new Set(after.map(contactIdentity));
  return {
    added: after.filter((contact) => !beforeKeys.has(contactIdentity(contact))),
    removed: before.filter((contact) => !afterKeys.has(contactIdentity(contact))),
  };
}

export async function notifyAssignmentChanges(
  db: DataSource,
  before: AssignmentContact[] | undefined,
  after: AssignmentContact[] | undefined,
  context: {
    eventType: string;
    eventId: string;
    roleLabel: string;
    eventLabel: string;
    date?: string;
    time?: string;
  },
): Promise<void> {
  const diff = diffAssignmentContacts(before, after);
  const schedule = [context.date, context.time].filter(Boolean).join(' à ');
  const suffix = schedule ? ` — ${schedule}` : '';

  await Promise.all([
    ...diff.added.map((contact) => notifyContact(db, contact, {
      type: 'assignment-created',
      title: `Nouvelle affectation · ${context.roleLabel}`,
      message: `${context.eventLabel}${suffix}`,
      eventType: context.eventType,
      eventId: context.eventId,
    })),
    ...diff.removed.map((contact) => notifyContact(db, contact, {
      type: 'assignment-removed',
      title: 'Affectation retirée',
      message: `${context.eventLabel}${suffix}`,
      eventType: context.eventType,
      eventId: context.eventId,
    })),
  ]);
}

/**
 * Un événement déjà publié doit rester la source de vérité vue par les personnes affectées
 * (« Mon planning », iCal, échanges) même quand une affectation est modifiée en dehors d'une
 * republication globale explicite (popover d'affectation, entraînements/plateaux, auto-
 * affectation…). Sans ça, la personne nouvellement affectée n'est jamais notifiée et ne voit
 * rien tant que personne n'a republié — reproduit et corrigé par l'issue #161. Reprend le même
 * traitement que `app/api/planning/assignment-swaps/route.ts` (seule route qui le faisait déjà
 * correctement) : notifier le diff, puis patcher le snapshot publié avec l'état à jour.
 */
const MATCH_CONTACT_FIELD_BY_ROLE: Record<PlanningRole, 'arbitreTouche' | 'contactEncadrants' | 'contactAccompagnateur'> = {
  arbitre: 'arbitreTouche',
  encadrant: 'contactEncadrants',
  accompagnateur: 'contactAccompagnateur',
};

/**
 * Reporte `contacts` sur le rôle donné d'un snapshot déjà publié, sans toucher au reste de ce
 * snapshot (date/heure/lieu, autres rôles) : « Mon planning »/iCal lisent `event`/`extras`
 * directement (pas `assignments`, qui n'est qu'une projection) — cf. `personal-planning.ts`
 * (`CONTACTS_BY_ROLE`) — donc c'est bien ces champs qu'il faut patcher. Un patch qui partirait
 * du snapshot live plutôt que du snapshot publié propagerait aussi, en plus de l'affectation,
 * toute autre modification live pas encore publiée (ex. un changement d'horaire en attente).
 */
function withPublishedRoleContacts(
  published: PlanningEventSnapshot,
  role: PlanningRole,
  contacts: AssignmentContact[],
): PlanningEventSnapshot {
  const assignments = { ...published.assignments, [role]: contacts };
  if (published.eventType === 'officiel' || published.eventType === 'amical') {
    const field = MATCH_CONTACT_FIELD_BY_ROLE[role];
    const extras = { ...(published.extras ?? { id: published.eventId }), [field]: contacts };
    return { ...published, assignments, extras };
  }
  const event = { ...(published.event as Entrainement | Plateau), encadrants: contacts };
  return { ...published, assignments, event };
}

/**
 * Un événement déjà publié doit rester la source de vérité vue par les personnes affectées
 * (« Mon planning », iCal, échanges) même quand une affectation est modifiée en dehors d'une
 * republication globale explicite (popover d'affectation, entraînements/plateaux, auto-
 * affectation…). Sans ça, la personne nouvellement affectée n'est jamais notifiée et ne voit
 * rien tant que personne n'a republié — reproduit et corrigé par l'issue #161. Reprend le même
 * traitement que `app/api/planning/assignment-swaps/route.ts` (seule route qui le faisait déjà
 * correctement) : resynchroniser l'état opérationnel persisté, notifier le diff, puis ne patcher
 * que le rôle concerné du snapshot publié.
 *
 * Le test de présence porte sur le snapshot publié actif (pas sur `planningStatus` du live) :
 * un événement passé à 'modified' par une édition non liée (ex. horaire) reste dans le snapshot
 * publié tant qu'il n'a pas été retiré, et une affectation qui lui arrive doit donc quand même
 * être propagée.
 */
export async function propagatePublishedAssignmentChange(
  db: DataSource,
  clubId: string,
  eventType: PlanningEventType,
  eventId: string,
  role: PlanningRole,
  before: AssignmentContact[] | undefined,
  after: AssignmentContact[] | undefined,
): Promise<void> {
  const diff = diffAssignmentContacts(before, after);
  if (!diff.added.length && !diff.removed.length) return;

  const publishedSnapshots = await listPublishedPlanningEventSnapshots(db);
  const published = publishedSnapshots?.find((item) => item.eventType === eventType && item.eventId === eventId);
  if (!published) return;

  // Réinitialise l'état opérationnel persisté (accepté/refusé) des contacts désormais affectés :
  // sans ça, une personne retirée puis réaffectée au même rôle/événement verrait son ancienne
  // réponse resurgir via l'overlay planning_assignment_state malgré un statut 'pending' republié.
  await syncAssignmentStatesForRole(db, eventType, eventId, role, after ?? [], clubId);

  await notifyAssignmentChanges(db, before, after, {
    eventType,
    eventId,
    roleLabel: role,
    eventLabel: published.title,
    date: published.date,
    time: published.time,
  });

  await patchPublishedPlanningEvent(db, clubId, withPublishedRoleContacts(published, role, after ?? []));
}
