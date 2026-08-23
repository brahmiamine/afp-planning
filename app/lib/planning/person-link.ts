import type { DataSource } from 'typeorm';
import type { UserRole } from '@/lib/auth/roles';
import type { PersonType } from '@/types/match';
import type { UserEntity } from '@/lib/db/schemas';

export function personTypeForRole(role: UserRole): PersonType | null {
  if (role === 'arbitre') return 'officiel';
  if (role === 'encadrant') return 'encadrant';
  if (role === 'accompagnateur') return 'accompagnateur';
  return null;
}

export function roleForPersonType(personType: PersonType): UserRole {
  if (personType === 'officiel') return 'arbitre';
  if (personType === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

/**
 * Un utilisateur EST la personne assignable (plus de table séparée officiel/encadrant/
 * accompagnateur) : on cherche directement dans `users`, filtré par club et par rôle.
 */
export async function findAssignablePerson(
  db: DataSource,
  clubId: string,
  personType: PersonType,
  input: { personId?: number | null; personNom?: string | null },
): Promise<UserEntity | null> {
  const repo = db.getRepository<UserEntity>('User');
  const role = roleForPersonType(personType);

  if (typeof input.personId === 'number' && Number.isFinite(input.personId)) {
    const byId = await repo.findOneBy({ id: input.personId, clubId });
    if (byId && byId.roles.includes(role)) return byId;
  }

  const personNom = input.personNom?.trim();
  if (!personNom) return null;

  const candidates = await repo
    .createQueryBuilder('user')
    .where('LOWER(user.nom) = :nom AND user.clubId = :clubId', { nom: personNom.toLowerCase(), clubId })
    .getMany();
  return candidates.find((user) => user.roles.includes(role)) ?? null;
}

/** Vrai si un contact d'affectation (nom, ou personId+personType) désigne cet utilisateur. */
export function personIdentityMatches(
  contact: { personId?: number; personType?: PersonType; nom: string },
  user: { id: number; nom: string },
): boolean {
  if (contact.personId !== undefined && contact.personType) {
    return contact.personId === user.id;
  }
  return contact.nom.trim().toLowerCase() === user.nom.trim().toLowerCase();
}
