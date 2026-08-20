import type { DataSource, Repository } from 'typeorm';
import type { UserRole } from '@/lib/auth/roles';
import type { PersonType } from '@/types/match';
import type {
  AccompagnateurEntity,
  EncadrantEntity,
  OfficielEntity,
} from '@/lib/db/schemas';

export type LinkedPersonEntity = OfficielEntity | EncadrantEntity | AccompagnateurEntity;

export interface PersonLink {
  personType: PersonType;
  personId: number;
  personNom: string;
}

export function personTypeForRole(role: UserRole): PersonType | null {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  if (role === 'accompagnateur') return 'accompagnateur';
  return null;
}

function repositoryNameForType(personType: PersonType): 'Officiel' | 'Encadrant' | 'Accompagnateur' {
  if (personType === 'officiel') return 'Officiel';
  if (personType === 'encadrant') return 'Encadrant';
  return 'Accompagnateur';
}

function getPersonRepository(db: DataSource, personType: PersonType): Repository<LinkedPersonEntity> {
  return db.getRepository<LinkedPersonEntity>(repositoryNameForType(personType));
}

export async function findLinkedPerson(
  db: DataSource,
  personType: PersonType,
  input: { personId?: number | null; personNom?: string | null },
): Promise<LinkedPersonEntity | null> {
  const repo = getPersonRepository(db, personType);

  if (typeof input.personId === 'number' && Number.isFinite(input.personId)) {
    const byId = await repo.findOneBy({ id: input.personId });
    if (byId) return byId;
  }

  const personNom = input.personNom?.trim();
  if (!personNom) return null;

  return repo
    .createQueryBuilder('person')
    .where('LOWER(person.nom) = :nom', { nom: personNom.toLowerCase() })
    .getOne();
}

export async function resolvePersonLinkForRole(
  db: DataSource,
  role: UserRole,
  input: {
    personId?: number | null;
    personType?: PersonType | null;
    personNom?: string | null;
  },
): Promise<PersonLink | null> {
  const expectedType = personTypeForRole(role);
  if (!expectedType) return null;

  if (input.personType && input.personType !== expectedType) {
    return null;
  }

  const person = await findLinkedPerson(db, expectedType, input);
  if (!person) return null;

  return {
    personType: expectedType,
    personId: person.id,
    personNom: person.nom,
  };
}

/**
 * Un utilisateur peut cumuler plusieurs rôles terrain (arbitre + encadrant, par ex.) : chaque
 * rôle terrain a besoin de son propre lien vers l'entité correspondante (Officiel/Encadrant/
 * Accompagnateur), car ce sont des tables distinctes. Retourne null si un des rôles demandés
 * n'a pas pu être résolu vers une personne existante.
 */
export async function resolvePersonLinksForRoles(
  db: DataSource,
  roles: UserRole[],
  personNomByRole: Partial<Record<UserRole, string | null>>,
): Promise<PersonLink[] | null> {
  const links: PersonLink[] = [];
  for (const role of roles) {
    const expectedType = personTypeForRole(role);
    if (!expectedType) continue;

    const link = await resolvePersonLinkForRole(db, role, { personNom: personNomByRole[role] ?? null });
    if (!link) return null;
    links.push(link);
  }
  return links;
}

export function personIdentityMatches(
  contact: { personId?: number; personType?: PersonType; nom: string },
  user: { personLinks: PersonLink[] },
): boolean {
  const contactName = contact.nom.trim().toLowerCase();
  return user.personLinks.some((link) => {
    if (contact.personId !== undefined && contact.personType) {
      return contact.personId === link.personId && contact.personType === link.personType;
    }
    return contactName === link.personNom.trim().toLowerCase();
  });
}
