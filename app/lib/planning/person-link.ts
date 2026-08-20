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

export function personIdentityMatches(
  contact: { personId?: number; personType?: PersonType; nom: string },
  user: { personId: number | null; personType: string | null; personNom: string | null },
): boolean {
  if (
    user.personId !== null &&
    user.personType &&
    contact.personId === user.personId &&
    contact.personType === user.personType
  ) {
    return true;
  }

  const fallbackName = user.personNom?.trim().toLowerCase();
  return !!fallbackName && contact.nom.trim().toLowerCase() === fallbackName;
}
