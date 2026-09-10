import type { DataSource } from 'typeorm';

const ENGINE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * DDL des tables portées par les EntitySchema TypeORM (issue #283).
 *
 * Ces instructions remplacent `synchronize()` au démarrage : une base neuve
 * obtient le schéma entités uniquement par le runner, une base existante ignore
 * les `CREATE TABLE IF NOT EXISTS` et reçoit seulement les durcissements
 * idempotents de `hardenTypeormEntityTables`.
 */
export const TYPEORM_ENTITY_TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS clubs (
    id INT NOT NULL AUTO_INCREMENT,
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    nom VARCHAR(255) NOT NULL,
    logo VARCHAR(255) NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE INDEX uq_clubs_club_nom (clubId, nom)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INT NOT NULL AUTO_INCREMENT,
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    value VARCHAR(255) NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE INDEX uq_categories_club_value (clubId, value)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS stades (
    id INT NOT NULL AUTO_INCREMENT,
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    nom VARCHAR(255) NOT NULL,
    adresse VARCHAR(255) NULL,
    googleMapsUrl VARCHAR(255) NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE INDEX uq_stades_club_nom (clubId, nom)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS matches_officiels (
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    id VARCHAR(255) NOT NULL,
    date VARCHAR(255) NOT NULL,
    time VARCHAR(255) NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (clubId, id),
    INDEX idx_matches_officiels_date (date)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS matches_amicaux (
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    id VARCHAR(255) NOT NULL,
    date VARCHAR(255) NOT NULL,
    time VARCHAR(255) NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (clubId, id),
    INDEX idx_matches_amicaux_date (date)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS entrainements (
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    id VARCHAR(255) NOT NULL,
    date VARCHAR(255) NOT NULL,
    time VARCHAR(255) NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (clubId, id),
    INDEX idx_entrainements_date (date)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS plateaux (
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    id VARCHAR(255) NOT NULL,
    date VARCHAR(255) NOT NULL,
    time VARCHAR(255) NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (clubId, id),
    INDEX idx_plateaux_date (date)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS matches_extras (
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    matchId VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (clubId, matchId)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    \`key\` VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (\`key\`)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    email VARCHAR(255) NOT NULL,
    passwordHash VARCHAR(255) NOT NULL,
    nom VARCHAR(255) NOT NULL,
    accessRole VARCHAR(255) NOT NULL DEFAULT 'dirigeant',
    planningFunctions TEXT NOT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    claimedAt DATETIME(6) NULL,
    telephone VARCHAR(255) NULL,
    indisponibilites TEXT NULL,
    icalToken VARCHAR(255) NOT NULL,
    notifyChannel VARCHAR(255) NOT NULL DEFAULT 'push',
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE INDEX uq_users_ical_token (icalToken),
    UNIQUE INDEX uq_users_club_email (clubId, email)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(255) NOT NULL,
    userId INT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expiresAt DATETIME(6) NOT NULL,
    revokedAt DATETIME(6) NULL,
    userAgent VARCHAR(255) NULL,
    ipAddress VARCHAR(255) NULL,
    PRIMARY KEY (id),
    INDEX idx_user_sessions_user_id (userId),
    INDEX idx_user_sessions_expires_at (expiresAt)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id VARCHAR(255) NOT NULL,
    clubId VARCHAR(255) NOT NULL DEFAULT 'afp',
    email VARCHAR(255) NULL,
    accessRole VARCHAR(255) NOT NULL DEFAULT 'dirigeant',
    planningFunctions TEXT NOT NULL,
    personNom VARCHAR(255) NULL,
    personType VARCHAR(255) NULL,
    personId INT NULL,
    createdByUserId INT NOT NULL,
    expiresAt DATETIME(6) NOT NULL,
    usedAt DATETIME(6) NULL,
    usedByUserId INT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_invitations_person (personType, personId)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS match_audit_log (
    id INT NOT NULL AUTO_INCREMENT,
    clubId VARCHAR(255) NOT NULL,
    entityType VARCHAR(255) NOT NULL,
    entityId VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    userId INT NULL,
    userEmail VARCHAR(255) NULL,
    userNom VARCHAR(255) NULL,
    \`before\` TEXT NULL,
    \`after\` TEXT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_match_audit_log_entity (clubId, entityType, entityId, createdAt),
    INDEX idx_match_audit_log_created_at (createdAt)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INT NOT NULL AUTO_INCREMENT,
    userId INT NOT NULL,
    type VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    eventType VARCHAR(255) NULL,
    eventId VARCHAR(255) NULL,
    readAt DATETIME(6) NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_notifications_user (userId, createdAt),
    INDEX idx_notifications_unread (userId, readAt)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    tokenHash VARCHAR(255) NOT NULL,
    userId INT NOT NULL,
    expiresAt DATETIME(6) NOT NULL,
    usedAt DATETIME(6) NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (tokenHash),
    INDEX idx_password_reset_user (userId, expiresAt)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS chat_rooms (
    id VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    clubId VARCHAR(255) NOT NULL,
    roomKey VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    description TEXT NULL,
    eventType VARCHAR(255) NULL,
    eventId VARCHAR(255) NULL,
    createdByUserId INT NOT NULL,
    nextSequence INT NOT NULL DEFAULT 1,
    archivedAt DATETIME(6) NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE INDEX IDX_chat_rooms_roomKey (roomKey),
    INDEX idx_chat_rooms_club_type (clubId, type),
    INDEX idx_chat_rooms_event (clubId, eventType, eventId)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS chat_participants (
    roomId VARCHAR(255) NOT NULL,
    userId INT NOT NULL,
    addedByUserId INT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (roomId, userId),
    INDEX idx_chat_participants_user (userId, roomId)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(255) NOT NULL,
    roomId VARCHAR(255) NOT NULL,
    senderUserId INT NOT NULL,
    senderName VARCHAR(255) NOT NULL,
    clientMessageId VARCHAR(255) NOT NULL,
    sequence INT NOT NULL,
    content TEXT NOT NULL,
    attachmentType VARCHAR(255) NULL,
    attachmentUrl VARCHAR(255) NULL,
    attachmentMimeType VARCHAR(255) NULL,
    attachmentName VARCHAR(255) NULL,
    attachmentSize INT NULL,
    replyToMessageId VARCHAR(255) NULL,
    forwardedFromName VARCHAR(255) NULL,
    forwardedFromUserId INT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deletedAt DATETIME(6) NULL,
    deletedByUserId INT NULL,
    PRIMARY KEY (id),
    UNIQUE INDEX uq_chat_messages_sequence (roomId, sequence),
    UNIQUE INDEX uq_chat_messages_client_id (roomId, senderUserId, clientMessageId),
    INDEX idx_chat_messages_created_at (roomId, createdAt)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS chat_read_states (
    roomId VARCHAR(255) NOT NULL,
    userId INT NOT NULL,
    lastReadSequence INT NOT NULL DEFAULT 0,
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (roomId, userId),
    INDEX idx_chat_read_states_user (userId, updatedAt)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS club_tenants (
    id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    abbreviation VARCHAR(255) NOT NULL DEFAULT '',
    description VARCHAR(255) NOT NULL DEFAULT '',
    logo TEXT NOT NULL,
    themeMode VARCHAR(255) NOT NULL DEFAULT 'system',
    primaryColor VARCHAR(255) NOT NULL DEFAULT '#1f2937',
    secondaryColor VARCHAR(255) NOT NULL DEFAULT '#e5e7eb',
    timeZone VARCHAR(255) NOT NULL DEFAULT 'Europe/Paris',
    matchesUrlKey VARCHAR(255) NOT NULL DEFAULT '',
    scraperClubName VARCHAR(255) NOT NULL DEFAULT '',
    featuresJson TEXT NOT NULL,
    smtpHost VARCHAR(255) NULL,
    smtpPort INT NULL,
    smtpSecure TINYINT NOT NULL DEFAULT 0,
    smtpUser VARCHAR(255) NULL,
    smtpPasswordEncrypted TEXT NULL,
    smtpFromEmail VARCHAR(255) NULL,
    smtpFromName VARCHAR(255) NULL,
    active TINYINT NOT NULL DEFAULT 1,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS platform_admins (
    id INT NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    passwordHash VARCHAR(255) NOT NULL,
    nom VARCHAR(255) NOT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE INDEX IDX_platform_admins_email (email)
  ) ${ENGINE}`,
  `CREATE TABLE IF NOT EXISTS platform_sessions (
    id VARCHAR(255) NOT NULL,
    platformAdminId INT NOT NULL,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expiresAt DATETIME(6) NOT NULL,
    revokedAt DATETIME(6) NULL,
    PRIMARY KEY (id),
    INDEX idx_platform_sessions_admin (platformAdminId)
  ) ${ENGINE}`,
];

const ENTITY_TABLES = [
  'clubs',
  'categories',
  'stades',
  'matches_officiels',
  'matches_amicaux',
  'entrainements',
  'plateaux',
  'matches_extras',
  'app_meta',
  'users',
  'user_sessions',
  'invitations',
  'match_audit_log',
  'notifications',
  'password_reset_tokens',
  'chat_rooms',
  'chat_participants',
  'chat_messages',
  'chat_read_states',
  'club_tenants',
  'platform_admins',
  'platform_sessions',
] as const;

async function hasTable(db: DataSource, table: string): Promise<boolean> {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  ) as Array<{ n?: number | string }>;
  return Number(rows[0]?.n) > 0;
}

async function hasColumn(db: DataSource, table: string, column: string): Promise<boolean> {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  ) as Array<{ n?: number | string }>;
  return Number(rows[0]?.n) > 0;
}

/**
 * Durcissements que `synchronize` appliquait après les migrations 0009/0010 :
 * colonnes héritées retirées, `match_audit_log.clubId` NOT NULL.
 */
export async function hardenTypeormEntityTables(db: DataSource): Promise<void> {
  if (await hasTable(db, 'users') && await hasColumn(db, 'users', 'roles')) {
    await db.query('ALTER TABLE users DROP COLUMN roles');
  }
  if (await hasTable(db, 'invitations') && await hasColumn(db, 'invitations', 'role')) {
    await db.query('ALTER TABLE invitations DROP COLUMN role');
  }

  if (await hasTable(db, 'match_audit_log') && await hasColumn(db, 'match_audit_log', 'clubId')) {
    const nulls = await db.query(
      'SELECT COUNT(*) AS n FROM match_audit_log WHERE clubId IS NULL OR clubId = \'\'',
    ) as Array<{ n?: number | string }>;
    if (Number(nulls[0]?.n) === 0) {
      await db.query('ALTER TABLE match_audit_log MODIFY clubId VARCHAR(255) NOT NULL');
    }
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_match_audit_log_entity ON match_audit_log (clubId, entityType, entityId, createdAt)',
    );
  }
}

export const TYPEORM_ENTITY_TABLE_NAMES = ENTITY_TABLES;
