import type { DataSource } from 'typeorm';
import { normalizePlanningFunctions, type PlanningFunction } from '@/lib/auth/roles';
import type { PersonType } from '@/types/match';
import type { UserEntity } from '@/lib/db/schemas';
import type { PlanningRole } from './event-store';

export function personTypeForFunction(planningFunction: PlanningFunction): PersonType {
  if (planningFunction === 'arbitre_club') return 'officiel';
  if (planningFunction === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

export function functionForPersonType(personType: PersonType): PlanningFunction {
  if (personType === 'officiel') return 'arbitre_club';
  if (personType === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

/** Poste d'affectation d'un événement → fonction opérationnelle requise pour le tenir. */
export function functionForPlanningRole(role: PlanningRole): PlanningFunction {
  if (role === 'arbitre') return 'arbitre_club';
  if (role === 'encadrant') return 'encadrant';
  return 'accompagnateur';
}

/** Fonctions opérationnelles effectivement tenues par un compte. */
export function planningFunctionsOf(user: Pick<UserEntity, 'planningFunctions'>): PlanningFunction[] {
  return normalizePlanningFunctions(user.planningFunctions);
}

/** Vrai si le compte tient la fonction requise par ce poste d'affectation. */
export function userHoldsFunction(
  user: Pick<UserEntity, 'planningFunctions'>,
  planningFunction: PlanningFunction,
): boolean {
  return planningFunctionsOf(user).includes(planningFunction);
}

/**
 * Un utilisateur EST la personne assignable (plus de table séparée officiel/encadrant/
 * accompagnateur) : on cherche directement dans `users`, filtré par club et par fonction.
 */
export async function findAssignablePerson(
  db: DataSource,
  clubId: string,
  personType: PersonType,
  input: { personId?: number | null; personNom?: string | null },
): Promise<UserEntity | null> {
  const repo = db.getRepository<UserEntity>('User');
  const planningFunction = functionForPersonType(personType);

  if (typeof input.personId === 'number' && Number.isFinite(input.personId)) {
    const byId = await repo.findOneBy({ id: input.personId, clubId });
    // Issue #206 : un dirigeant désactivé ne doit plus être proposé pour une nouvelle
    // affectation, même s'il tient toujours la fonction requise.
    if (byId && byId.active && userHoldsFunction(byId, planningFunction)) return byId;
  }

  const personNom = input.personNom?.trim();
  if (!personNom) return null;

  const candidates = await repo
    .createQueryBuilder('user')
    .where('LOWER(user.nom) = :nom AND user.clubId = :clubId AND user.active = :active', {
      nom: personNom.toLowerCase(),
      clubId,
      active: true,
    })
    .getMany();
  return candidates.find((user) => userHoldsFunction(user, planningFunction)) ?? null;
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
