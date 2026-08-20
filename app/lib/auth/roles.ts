export type UserRole = 'superadmin' | 'admin' | 'arbitre' | 'encadrant' | 'accompagnateur';

export const ALL_ROLES: UserRole[] = ['superadmin', 'admin', 'arbitre', 'encadrant', 'accompagnateur'];

export const WRITE_ROLES: UserRole[] = ['superadmin', 'admin'];

export const READ_ONLY_ROLES: UserRole[] = ['arbitre', 'encadrant', 'accompagnateur'];

export const INVITABLE_ROLES: UserRole[] = ['admin', 'arbitre', 'encadrant', 'accompagnateur'];

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super administrateur',
  admin: 'Administrateur',
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}

/** Un utilisateur peut cumuler plusieurs rôles (ex: arbitre + encadrant). */
export function normalizeRoles(value: unknown): UserRole[] {
  const list = Array.isArray(value) ? value : [value];
  const roles = list.filter(isUserRole);
  return Array.from(new Set(roles));
}

export function hasRole(roles: UserRole[] | null | undefined, role: UserRole): boolean {
  return !!roles && roles.includes(role);
}

export function canEdit(roles: UserRole[] | null | undefined): boolean {
  return !!roles && roles.some((role) => (WRITE_ROLES as string[]).includes(role));
}

export function isSuperadmin(roles: UserRole[] | null | undefined): boolean {
  return hasRole(roles, 'superadmin');
}

/** Vrai si l'utilisateur n'a que des rôles terrain (aucun rôle d'écriture). */
export function isReadOnlyRole(roles: UserRole[] | null | undefined): boolean {
  return !!roles && roles.length > 0 && roles.every((role) => (READ_ONLY_ROLES as string[]).includes(role));
}

/** Rôles terrain effectivement tenus par l'utilisateur (sous-ensemble de READ_ONLY_ROLES). */
export function readOnlyRolesOf(roles: UserRole[] | null | undefined): UserRole[] {
  return (roles ?? []).filter((role) => (READ_ONLY_ROLES as string[]).includes(role));
}
