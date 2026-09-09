import type { SchemaMigration } from './runner';
import { convertEventPrimaryKeysToTenantScoped } from './event-primary-keys';
import { backfillAuditLogClubId } from './audit-log-tenant';
import { backfillClubAccessRoles } from './club-access-roles';

/**
 * Registre des migrations de schéma versionnées (issue #129).
 *
 * Les migrations 0001 à 0007 reprennent à l'identique le DDL qui était auparavant
 * exécuté au runtime par les modules métier (`CREATE TABLE IF NOT EXISTS` au premier
 * appel). Toute évolution future du schéma hors entités TypeORM doit ajouter une
 * nouvelle migration ici — jamais modifier une migration déjà publiée.
 *
 * La migration 0008 (issue #125) convertit les clés primaires des tables
 * d'événements en clés composites tenant-scoped ; elle est exécutée par le runner
 * — avant `synchronize` — pour vérifier les collisions avant toute modification.
 *
 * La migration 0009 (issue #126) ajoute la colonne tenant `clubId` (nullable) à
 * `match_audit_log` et la remplit par jointure sur `users`, avec repli signalé
 * sur le club par défaut pour les lignes sans auteur résolu ; `synchronize`
 * durcit ensuite la colonne en NOT NULL et crée l'index tenant.
 *
 * La migration 0010 (issue #209) sépare le rôle d'accès au club (`accessRole`) des
 * fonctions opérationnelles (`planningFunctions`) sur `users` et `invitations` : les
 * colonnes sont ajoutées nullables et remplies depuis l'ancien tableau cumulatif
 * `roles`, que `synchronize` supprime ensuite.
 *
 * Rappel : les tables portées par les entités TypeORM (`EntitySchema` dans
 * `app/lib/db/schemas.ts`) restent gérées par `synchronize`, exécuté APRÈS ce
 * registre ; ce registre couvre tout le schéma qui vivait en dehors des entités,
 * ainsi que les conversions de schéma exigeant des vérifications préalables.
 */
export const schemaMigrations: readonly SchemaMigration[] = [
  {
    version: '0001',
    name: 'planning_records_et_attachments',
    statements: [
      `CREATE TABLE IF NOT EXISTS planning_records (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        kind VARCHAR(64) NOT NULL,
        event_type VARCHAR(32) NULL,
        event_id VARCHAR(191) NULL,
        owner_user_id INT NULL,
        person_type VARCHAR(32) NULL,
        person_id INT NULL,
        payload LONGTEXT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_planning_records_kind (kind),
        INDEX idx_planning_records_event (event_type, event_id, kind),
        INDEX idx_planning_records_owner (owner_user_id, kind),
        INDEX idx_planning_records_person (person_type, person_id, kind)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE IF NOT EXISTS planning_attachments (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        event_type VARCHAR(32) NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        content LONGBLOB NOT NULL,
        uploaded_by_user_id INT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_planning_attachments_event (event_type, event_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      // Colonnes tenant ajoutées après coup à l'époque : rejouées ici pour les
      // bases héritées d'avant leur introduction.
      `ALTER TABLE planning_records ADD COLUMN IF NOT EXISTS club_id VARCHAR(64) NOT NULL DEFAULT 'afp' AFTER id`,
      `ALTER TABLE planning_attachments ADD COLUMN IF NOT EXISTS club_id VARCHAR(64) NOT NULL DEFAULT 'afp' AFTER id`,
      `CREATE INDEX IF NOT EXISTS idx_planning_records_club ON planning_records (club_id, kind)`,
      `CREATE INDEX IF NOT EXISTS idx_planning_attachments_club ON planning_attachments (club_id, event_type, event_id)`,
    ],
    // Note : l'ancien `ensurePlanningSupportTables` réattribuait toutes les lignes
    // au club `APP_CLUB_ID` lors de l'ajout initial de la colonne. Ce rattrapage a
    // déjà été exécuté sur toute base ayant démarré l'application depuis lors ; il
    // n'est pas rejoué ici (une base existante possède déjà la colonne, une base
    // neuve n'a aucune ligne à rattraper).
  },
  {
    version: '0002',
    name: 'planning_event_state',
    statements: [
      `CREATE TABLE IF NOT EXISTS planning_event_state (
        club_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        archived_at DATETIME(6) NULL,
        archived_by_user_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (club_id, event_type, event_id),
        INDEX idx_planning_event_state_archived (club_id, archived_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    version: '0003',
    name: 'push_subscriptions',
    statements: [
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint_hash CHAR(64) NOT NULL UNIQUE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NULL,
        auth_secret TEXT NULL,
        user_agent VARCHAR(512) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_push_subscriptions_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    version: '0004',
    name: 'planning_notification_outbox',
    statements: [
      `CREATE TABLE IF NOT EXISTS planning_notification_outbox (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        channel VARCHAR(16) NOT NULL,
        notification_type VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        event_type VARCHAR(32) NULL,
        event_id VARCHAR(191) NULL,
        urgency VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        last_error TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        sent_at DATETIME(6) NULL,
        INDEX idx_notification_outbox_due (status, next_attempt_at),
        INDEX idx_notification_outbox_user (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    version: '0005',
    name: 'chat_attachments',
    statements: [
      `CREATE TABLE IF NOT EXISTS chat_attachments (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        club_id VARCHAR(64) NOT NULL,
        room_id VARCHAR(64) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        content LONGBLOB NOT NULL,
        uploaded_by_user_id INT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_chat_attachments_room (room_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    version: '0006',
    name: 'scraper_sync_runs',
    statements: [
      `CREATE TABLE IF NOT EXISTS scraper_sync_runs (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        club_id VARCHAR(64) NOT NULL DEFAULT 'afp',
        status VARCHAR(16) NOT NULL,
        started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        finished_at DATETIME(6) NULL,
        active_count INT NULL,
        created_count INT NULL,
        updated_count INT NULL,
        missing_count INT NULL,
        error_message TEXT NULL,
        INDEX idx_scraper_sync_runs_started (started_at),
        INDEX idx_scraper_sync_runs_status (status, started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      // Colonne tenant ajoutée après coup à l'époque : rejouée pour les bases héritées.
      `ALTER TABLE scraper_sync_runs ADD COLUMN IF NOT EXISTS club_id VARCHAR(64) NOT NULL DEFAULT 'afp'`,
      `CREATE INDEX IF NOT EXISTS idx_scraper_sync_runs_club ON scraper_sync_runs (club_id, started_at)`,
    ],
  },
  {
    version: '0007',
    name: 'planning_assignment_state',
    statements: [
      `CREATE TABLE IF NOT EXISTS planning_assignment_state (
        club_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        role VARCHAR(32) NOT NULL,
        person_key VARCHAR(255) NOT NULL,
        person_type VARCHAR(32) NULL,
        person_id INT NULL,
        person_name VARCHAR(255) NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (club_id, event_type, event_id, role, person_key),
        INDEX idx_assignment_state_person (club_id, person_type, person_id),
        INDEX idx_assignment_state_event (club_id, event_type, event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
  {
    version: '0008',
    name: 'cles_primaires_evenements_tenant_scoped',
    // Conversion conditionnelle (vérification des collisions avant ALTER) :
    // implémentée dans `up`, sans statement SQL statique — voir event-primary-keys.ts.
    statements: [],
    up: convertEventPrimaryKeysToTenantScoped,
  },
  {
    version: '0009',
    name: 'audit_log_tenant_scoped',
    // La colonne est ajoutée nullable (une NOT NULL ne peut pas être créée sur
    // une table remplie) puis remplie par `up` ; `synchronize` la durcit en
    // NOT NULL et crée l'index tenant — voir audit-log-tenant.ts.
    statements: [
      'ALTER TABLE IF EXISTS match_audit_log ADD COLUMN IF NOT EXISTS clubId VARCHAR(255) NULL AFTER id',
    ],
    up: async (db) => {
      await backfillAuditLogClubId(db);
    },
  },
  {
    version: '0010',
    name: 'roles_acces_club_et_fonctions_planning',
    // Colonnes ajoutées nullables sur des tables remplies, puis backfill depuis
    // l'ancien tableau `roles` ; `synchronize` les durcit et retire `roles`
    // (users) / `role` (invitations) — voir club-access-roles.ts.
    statements: [
      'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS accessRole VARCHAR(255) NULL AFTER nom',
      'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS planningFunctions TEXT NULL AFTER accessRole',
      'ALTER TABLE IF EXISTS invitations ADD COLUMN IF NOT EXISTS accessRole VARCHAR(255) NULL AFTER email',
      'ALTER TABLE IF EXISTS invitations ADD COLUMN IF NOT EXISTS planningFunctions TEXT NULL AFTER accessRole',
    ],
    up: async (db) => {
      await backfillClubAccessRoles(db);
    },
  },
  {
    version: '0011',
    name: 'chat_attachment_quota_indexes',
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_chat_attachments_user_quota
       ON chat_attachments (club_id, uploaded_by_user_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_attachments_club_quota
       ON chat_attachments (club_id, created_at)`,
    ],
  },
];
