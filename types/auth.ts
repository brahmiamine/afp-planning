export const USER_ROLES = ['SUPER_ADMIN', 'ARBITRE', 'ENCADRANT', 'ACCOMPAGNATEUR'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PERSON_ROLES = ['ARBITRE', 'ENCADRANT', 'ACCOMPAGNATEUR'] as const;

export type PersonRole = (typeof PERSON_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

export function isPersonRole(value: unknown): value is PersonRole {
  return typeof value === 'string' && PERSON_ROLES.includes(value as PersonRole);
}

export interface AuthSession {
  sub: number;
  email: string;
  role: UserRole;
  personId?: number;
  personName?: string;
  exp: number;
}

export interface AuthUserSummary {
  id: number;
  email: string;
  role: UserRole;
  personId: number | null;
  personName: string | null;
  active: boolean;
  editable: boolean;
}

export interface PersonOption {
  id: number;
  nom: string;
}

export type PersonOptionsByRole = Record<PersonRole, PersonOption[]>;

export type PersonalEventType = 'match-officiel' | 'match-amical' | 'entrainement' | 'plateau';

export interface PersonalPlanningEvent {
  id: string;
  type: PersonalEventType;
  date: string;
  time: string;
  title: string;
  subtitle?: string;
  location?: string;
  roleLabel: string;
  confirmed?: boolean;
}

export interface PersonalPlanningResponse {
  user: {
    id: number;
    email: string;
    role: PersonRole;
    displayName: string;
  };
  club: {
    name: string;
    description: string;
    logo: string;
  };
  events: PersonalPlanningEvent[];
}
