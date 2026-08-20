import { EntitySchema } from 'typeorm';
import { OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

function defaultClubId(): string {
  return process.env.APP_CLUB_ID || 'afp';
}

export interface OfficielEntity {
  id: number;
  clubId: string;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncadrantEntity {
  id: number;
  clubId: string;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccompagnateurEntity {
  id: number;
  clubId: string;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubEntity {
  id: number;
  clubId: string;
  nom: string;
  logo: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategorieEntity {
  id: number;
  clubId: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StadeEntity {
  id: number;
  clubId: string;
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchOfficialEntity {
  id: string;
  clubId: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchAmicalEntity {
  id: string;
  clubId: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntrainementEntity {
  id: string;
  clubId: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlateauEntity {
  id: string;
  clubId: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchExtraEntity {
  matchId: string;
  clubId: string;
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
  indices: [{ name: 'uq_officiels_club_nom', columns: ['clubId', 'nom'], unique: true }],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: defaultClubId() },
    nom: { type: String },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const EncadrantSchema = new EntitySchema<EncadrantEntity>({
  name: 'Encadrant',
  tableName: 'encadrants',
  indices: [{ name: 'uq_encadrants_club_nom', columns: ['clubId', 'nom'], unique: true }],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: defaultClubId() },
    nom: { type: String },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const AccompagnateurSchema = new EntitySchema<AccompagnateurEntity>({
  name: 'Accompagnateur',
  tableName: 'accompagnateurs',
  indices: [{ name: 'uq_accompagnateurs_club_nom', columns: ['clubId', 'nom'], unique: true }],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: defaultClubId() },
    nom: { type: String },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const ClubSchema = new EntitySchema<ClubEntity>({
  name: 'Club',
  tableName: 'clubs',
  indices: [{ name: 'uq_clubs_club_nom', columns: ['clubId', 'nom'], unique: true }],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: defaultClubId() },
    nom: { type: String },
    logo: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const CategorieSchema = new EntitySchema<CategorieEntity>({
  name: 'Categorie',
  tableName: 'categories',
  indices: [{ name: 'uq_categories_club_value', columns: ['clubId', 'value'], unique: true }],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: defaultClubId() },
    value: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const StadeSchema = new EntitySchema<StadeEntity>({
  name: 'Stade',
  tableName: 'stades',
  indices: [{ name: 'uq_stades_club_nom', columns: ['clubId', 'nom'], unique: true }],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: defaultClubId() },
    nom: { type: String },
    adresse: { type: String, nullable: true },
    googleMapsUrl: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchOfficialSchema = new EntitySchema<MatchOfficialEntity>({
  name: 'MatchOfficial',
  tableName: 'matches_officiels',
  indices: [
    { name: 'idx_matches_officiels_date', columns: ['date'] },
    { name: 'idx_matches_officiels_club', columns: ['clubId'] },
  ],
  columns: {
    id: { type: String, primary: true },
    clubId: { type: String, default: defaultClubId() },
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
  indices: [
    { name: 'idx_matches_amicaux_date', columns: ['date'] },
    { name: 'idx_matches_amicaux_club', columns: ['clubId'] },
  ],
  columns: {
    id: { type: String, primary: true },
    clubId: { type: String, default: defaultClubId() },
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
  indices: [
    { name: 'idx_entrainements_date', columns: ['date'] },
    { name: 'idx_entrainements_club', columns: ['clubId'] },
  ],
  columns: {
    id: { type: String, primary: true },
    clubId: { type: String, default: defaultClubId() },
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
  indices: [
    { name: 'idx_plateaux_date', columns: ['date'] },
    { name: 'idx_plateaux_club', columns: ['clubId'] },
  ],
  columns: {
    id: { type: String, primary: true },
    clubId: { type: String, default: defaultClubId() },
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
  indices: [{ name: 'idx_matches_extras_club', columns: ['clubId'] }],
  columns: {
    matchId: { type: String, primary: true },
    clubId: { type: String, default: defaultClubId() },
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

export interface UserPersonLinkRecord {
  personType: string;
  personId: number;
  personNom: string;
}

export interface UserEntity {
  id: number;
  clubId: string;
  email: string;
  passwordHash: string;
  nom: string;
  roles: string[];
  active: boolean;
  personLinks: UserPersonLinkRecord[];
  icalToken: string;
  notifyChannel: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new EntitySchema<UserEntity>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    clubId: { type: String, default: process.env.APP_CLUB_ID || 'afp' },
    email: { type: String, unique: true },
    passwordHash: { type: String },
    nom: { type: String },
    roles: { type: 'simple-json' },
    active: { type: Boolean, default: true },
    personLinks: { type: 'simple-json', default: '[]' },
    icalToken: { type: String, unique: true },
    notifyChannel: { type: String, default: 'push' },
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
  clubId: string;
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
    clubId: { type: String, default: process.env.APP_CLUB_ID || 'afp' },
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

export type ChatRoomKind = 'direct' | 'event' | 'channel';

export interface ChatRoomEntity {
  id: string;
  type: ChatRoomKind;
  clubId: string;
  roomKey: string;
  name: string | null;
  description: string | null;
  eventType: string | null;
  eventId: string | null;
  createdByUserId: number;
  nextSequence: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ChatRoomSchema = new EntitySchema<ChatRoomEntity>({
  name: 'ChatRoom',
  tableName: 'chat_rooms',
  indices: [
    { name: 'idx_chat_rooms_club_type', columns: ['clubId', 'type'] },
    { name: 'idx_chat_rooms_event', columns: ['clubId', 'eventType', 'eventId'] },
  ],
  columns: {
    id: { type: String, primary: true },
    type: { type: String },
    clubId: { type: String },
    roomKey: { type: String, unique: true },
    name: { type: String, nullable: true },
    description: { type: 'text', nullable: true },
    eventType: { type: String, nullable: true },
    eventId: { type: String, nullable: true },
    createdByUserId: { type: Number },
    nextSequence: { type: Number, default: 1 },
    archivedAt: { type: Date, nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export interface ChatParticipantEntity {
  roomId: string;
  userId: number;
  addedByUserId: number;
  createdAt: Date;
}

export const ChatParticipantSchema = new EntitySchema<ChatParticipantEntity>({
  name: 'ChatParticipant',
  tableName: 'chat_participants',
  indices: [{ name: 'idx_chat_participants_user', columns: ['userId', 'roomId'] }],
  columns: {
    roomId: { type: String, primary: true },
    userId: { type: Number, primary: true },
    addedByUserId: { type: Number },
    createdAt: { type: Date, createDate: true },
  },
});

export type ChatAttachmentType = 'image' | 'video' | 'audio' | 'gif';

export interface ChatMessageEntity {
  id: string;
  roomId: string;
  senderUserId: number;
  senderName: string;
  clientMessageId: string;
  sequence: number;
  content: string;
  attachmentType: ChatAttachmentType | null;
  attachmentUrl: string | null;
  attachmentMimeType: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  createdAt: Date;
}

export const ChatMessageSchema = new EntitySchema<ChatMessageEntity>({
  name: 'ChatMessage',
  tableName: 'chat_messages',
  indices: [
    { name: 'uq_chat_messages_sequence', columns: ['roomId', 'sequence'], unique: true },
    {
      name: 'uq_chat_messages_client_id',
      columns: ['roomId', 'senderUserId', 'clientMessageId'],
      unique: true,
    },
    { name: 'idx_chat_messages_created_at', columns: ['roomId', 'createdAt'] },
  ],
  columns: {
    id: { type: String, primary: true },
    roomId: { type: String },
    senderUserId: { type: Number },
    senderName: { type: String },
    clientMessageId: { type: String },
    sequence: { type: Number },
    content: { type: 'text' },
    attachmentType: { type: String, nullable: true },
    attachmentUrl: { type: String, nullable: true },
    attachmentMimeType: { type: String, nullable: true },
    attachmentName: { type: String, nullable: true },
    attachmentSize: { type: Number, nullable: true },
    createdAt: { type: Date, createDate: true },
  },
});

export interface ChatReadStateEntity {
  roomId: string;
  userId: number;
  lastReadSequence: number;
  updatedAt: Date;
}

export const ChatReadStateSchema = new EntitySchema<ChatReadStateEntity>({
  name: 'ChatReadState',
  tableName: 'chat_read_states',
  indices: [{ name: 'idx_chat_read_states_user', columns: ['userId', 'updatedAt'] }],
  columns: {
    roomId: { type: String, primary: true },
    userId: { type: Number, primary: true },
    lastReadSequence: { type: Number, default: 0 },
    updatedAt: { type: Date, updateDate: true },
  },
});

export interface ClubTenantEntity {
  id: string;
  name: string;
  description: string;
  logo: string;
  themeMode: string;
  primaryColor: string;
  secondaryColor: string;
  timeZone: string;
  matchesUrlKey: string;
  scraperClubName: string;
  featuresJson: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPasswordEncrypted: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ClubTenantSchema = new EntitySchema<ClubTenantEntity>({
  name: 'ClubTenant',
  tableName: 'club_tenants',
  columns: {
    id: { type: String, primary: true },
    name: { type: String },
    description: { type: String, default: '' },
    logo: { type: 'text', default: '' },
    themeMode: { type: String, default: 'system' },
    primaryColor: { type: String, default: '#1f2937' },
    secondaryColor: { type: String, default: '#e5e7eb' },
    timeZone: { type: String, default: 'Europe/Paris' },
    matchesUrlKey: { type: String, default: '' },
    scraperClubName: { type: String, default: '' },
    featuresJson: { type: 'text', default: '{}' },
    smtpHost: { type: String, nullable: true },
    smtpPort: { type: Number, nullable: true },
    smtpSecure: { type: Boolean, default: false },
    smtpUser: { type: String, nullable: true },
    smtpPasswordEncrypted: { type: 'text', nullable: true },
    smtpFromEmail: { type: String, nullable: true },
    smtpFromName: { type: String, nullable: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export interface PlatformAdminEntity {
  id: number;
  email: string;
  passwordHash: string;
  nom: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const PlatformAdminSchema = new EntitySchema<PlatformAdminEntity>({
  name: 'PlatformAdmin',
  tableName: 'platform_admins',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    email: { type: String, unique: true },
    passwordHash: { type: String },
    nom: { type: String },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export interface PlatformSessionEntity {
  id: string;
  platformAdminId: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export const PlatformSessionSchema = new EntitySchema<PlatformSessionEntity>({
  name: 'PlatformSession',
  tableName: 'platform_sessions',
  indices: [{ name: 'idx_platform_sessions_admin', columns: ['platformAdminId'] }],
  columns: {
    id: { type: String, primary: true },
    platformAdminId: { type: Number },
    createdAt: { type: Date, createDate: true },
    expiresAt: { type: Date },
    revokedAt: { type: Date, nullable: true },
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
  ChatRoomSchema,
  ChatParticipantSchema,
  ChatMessageSchema,
  ChatReadStateSchema,
  ClubTenantSchema,
  PlatformAdminSchema,
  PlatformSessionSchema,
];
