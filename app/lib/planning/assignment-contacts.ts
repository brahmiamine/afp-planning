import type { DataSource } from 'typeorm';
import type { AssignmentContact, AssignmentStatus, PersonType } from '@/types/match';
import { findLinkedPerson } from './person-link';
import { notifyContact } from '@/lib/notifications/service';

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
    const person = await findLinkedPerson(db, personType, { personId: rawPersonId, personNom: nom });
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
