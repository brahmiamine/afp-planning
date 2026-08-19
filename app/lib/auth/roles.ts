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

export function canEdit(role: UserRole | null | undefined): boolean {
  return !!role && WRITE_ROLES.includes(role);
}

export function isSuperadmin(role: UserRole | null | undefined): boolean {
  return role === 'superadmin';
}

export function isReadOnlyRole(role: UserRole | null | undefined): boolean {
  return !!role && READ_ONLY_ROLES.includes(role);
}
