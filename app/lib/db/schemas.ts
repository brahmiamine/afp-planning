import { EntitySchema } from 'typeorm';
import { OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

export interface OfficielEntity {
  id: number;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncadrantEntity {
  id: number;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccompagnateurEntity {
  id: number;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubEntity {
  id: number;
  nom: string;
  logo: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategorieEntity {
  id: number;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StadeEntity {
  id: number;
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchOfficialEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchAmicalEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntrainementEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlateauEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchExtraEntity {
  matchId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppMetaEntity {
  key: string;
  value: string;
  updatedAt: Date;
}

export const OfficielSchema = new EntitySchema<OfficielEntity>({
  name: 'Officiel',
  tableName: 'officiels',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const EncadrantSchema = new EntitySchema<EncadrantEntity>({
  name: 'Encadrant',
  tableName: 'encadrants',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const AccompagnateurSchema = new EntitySchema<AccompagnateurEntity>({
  name: 'Accompagnateur',
  tableName: 'accompagnateurs',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const ClubSchema = new EntitySchema<ClubEntity>({
  name: 'Club',
  tableName: 'clubs',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    logo: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const CategorieSchema = new EntitySchema<CategorieEntity>({
  name: 'Categorie',
  tableName: 'categories',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    value: { type: String, unique: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const StadeSchema = new EntitySchema<StadeEntity>({
  name: 'Stade',
  tableName: 'stades',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    adresse: { type: String, nullable: true },
    googleMapsUrl: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchOfficialSchema = new EntitySchema<MatchOfficialEntity>({
  name: 'MatchOfficial',
  tableName: 'matches_officiels',
  indices: [{ name: 'idx_matches_officiels_date', columns: ['date'] }],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchAmicalSchema = new EntitySchema<MatchAmicalEntity>({
  name: 'MatchAmical',
  tableName: 'matches_amicaux',
  indices: [{ name: 'idx_matches_amicaux_date', columns: ['date'] }],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const EntrainementSchema = new EntitySchema<EntrainementEntity>({
  name: 'Entrainement',
  tableName: 'entrainements',
  indices: [{ name: 'idx_entrainements_date', columns: ['date'] }],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const PlateauSchema = new EntitySchema<PlateauEntity>({
  name: 'Plateau',
  tableName: 'plateaux',
  indices: [{ name: 'idx_plateaux_date', columns: ['date'] }],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchExtraSchema = new EntitySchema<MatchExtraEntity>({
  name: 'MatchExtra',
  tableName: 'matches_extras',
  columns: {
    matchId: { type: String, primary: true },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const AppMetaSchema = new EntitySchema<AppMetaEntity>({
  name: 'AppMeta',
  tableName: 'app_meta',
  columns: {
    key: { type: String, primary: true },
    value: { type: 'text' },
    updatedAt: { type: Date, updateDate: true },
  },
});

export interface UserEntity {
  id: number;
  email: string;
  passwordHash: string;
  nom: string;
  role: string;
  active: boolean;
  personNom: string | null;
  personType: string | null;
  personId: number | null;
  icalToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new EntitySchema<UserEntity>({
  name: 'User',
  tableName: 'users',
  indices: [
    { name: 'idx_users_role', columns: ['role'] },
    { name: 'idx_users_person', columns: ['personType', 'personId'] },
  ],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    email: { type: String, unique: true },
    passwordHash: { type: String },
    nom: { type: String },
    role: { type: String, default: 'admin' },
    active: { type: Boolean, default: true },
    personNom: { type: String, nullable: true },
    personType: { type: String, nullable: true },
    personId: { type: Number, nullable: true },
    icalToken: { type: String, unique: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export interface UserSessionEntity {
  id: string;
  userId: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export const UserSessionSchema = new EntitySchema<UserSessionEntity>({
  name: 'UserSession',
  tableName: 'user_sessions',
  indices: [
    { name: 'idx_user_sessions_user_id', columns: ['userId'] },
    { name: 'idx_user_sessions_expires_at', columns: ['expiresAt'] },
  ],
  columns: {
    id: { type: String, primary: true },
    userId: { type: Number },
    createdAt: { type: Date, createDate: true },
    expiresAt: { type: Date },
    revokedAt: { type: Date, nullable: true },
    userAgent: { type: String, nullable: true },
    ipAddress: { type: String, nullable: true },
  },
});

export interface InvitationEntity {
  id: string;
  email: string | null;
  role: string;
  personNom: string | null;
  personType: string | null;
  personId: number | null;
  createdByUserId: number;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: number | null;
  createdAt: Date;
}

export const InvitationSchema = new EntitySchema<InvitationEntity>({
  name: 'Invitation',
  tableName: 'invitations',
  indices: [{ name: 'idx_invitations_person', columns: ['personType', 'personId'] }],
  columns: {
    id: { type: String, primary: true },
    email: { type: String, nullable: true },
    role: { type: String },
    personNom: { type: String, nullable: true },
    personType: { type: String, nullable: true },
    personId: { type: Number, nullable: true },
    createdByUserId: { type: Number },
    expiresAt: { type: Date },
    usedAt: { type: Date, nullable: true },
    usedByUserId: { type: Number, nullable: true },
    createdAt: { type: Date, createDate: true },
  },
});

export interface MatchAuditLogEntity {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  userId: number | null;
  userEmail: string | null;
  userNom: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
}

export const MatchAuditLogSchema = new EntitySchema<MatchAuditLogEntity>({
  name: 'MatchAuditLog',
  tableName: 'match_audit_log',
  indices: [
    { name: 'idx_match_audit_log_entity', columns: ['entityType', 'entityId', 'createdAt'] },
    { name: 'idx_match_audit_log_created_at', columns: ['createdAt'] },
  ],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    entityType: { type: String },
    entityId: { type: String },
    action: { type: String },
    userId: { type: Number, nullable: true },
    userEmail: { type: String, nullable: true },
    userNom: { type: String, nullable: true },
    before: { type: 'simple-json', nullable: true },
    after: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
  },
});

export interface NotificationEntity {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  eventType: string | null;
  eventId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export const NotificationSchema = new EntitySchema<NotificationEntity>({
  name: 'Notification',
  tableName: 'notifications',
  indices: [
    { name: 'idx_notifications_user', columns: ['userId', 'createdAt'] },
    { name: 'idx_notifications_unread', columns: ['userId', 'readAt'] },
  ],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    userId: { type: Number },
    type: { type: String },
    title: { type: String },
    message: { type: 'text' },
    eventType: { type: String, nullable: true },
    eventId: { type: String, nullable: true },
    readAt: { type: Date, nullable: true },
    createdAt: { type: Date, createDate: true },
  },
});

export interface PasswordResetTokenEntity {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export const PasswordResetTokenSchema = new EntitySchema<PasswordResetTokenEntity>({
  name: 'PasswordResetToken',
  tableName: 'password_reset_tokens',
  indices: [{ name: 'idx_password_reset_user', columns: ['userId', 'expiresAt'] }],
  columns: {
    tokenHash: { type: String, primary: true },
    userId: { type: Number },
    expiresAt: { type: Date },
    usedAt: { type: Date, nullable: true },
    createdAt: { type: Date, createDate: true },
  },
});

export const allSchemas = [
  OfficielSchema,
  EncadrantSchema,
  AccompagnateurSchema,
  ClubSchema,
  CategorieSchema,
  StadeSchema,
  MatchOfficialSchema,
  MatchAmicalSchema,
  EntrainementSchema,
  PlateauSchema,
  MatchExtraSchema,
  AppMetaSchema,
  UserSchema,
  UserSessionSchema,
  InvitationSchema,
  MatchAuditLogSchema,
  NotificationSchema,
  PasswordResetTokenSchema,
];
