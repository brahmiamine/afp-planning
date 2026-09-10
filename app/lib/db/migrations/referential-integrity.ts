import type { DataSource } from 'typeorm';

/**
 * Migration 0019 (issue #350) : intégrité référentielle sur les relations critiques
 * vers `users`.
 *
 * Contexte : les tables TypeORM et SQL brutes ne portaient aucune FOREIGN KEY MariaDB ;
 * l'intégrité était entièrement déléguée au code applicatif.
 *
 * Stratégie retenue (phase 1) :
 * 1. Purger les orphelins existants (sessions, notifications, participants chat).
 * 2. Poser des FK sélectives avec ON DELETE CASCADE — la suppression physique d'un
 *    utilisateur (rare, après contrôle `findUserReferences`) entraîne le nettoyage
 *    automatique de ses dépendances directes, sans cascade sur l'historique d'audit.
 *
 * ON DELETE par entité :
 * - `user_sessions.userId` → CASCADE : une session sans utilisateur est inexploitable.
 * - `notifications.userId` → CASCADE : notification orpheline = bruit / fuite potentielle.
 * - `chat_participants.userId` → CASCADE : retirer l'utilisateur supprimé des salons.
 *
 * Désactivation utilisateur : inchangée côté applicatif — `revokeAllSessionsForUser`
 * révoque les sessions actives sans supprimer la ligne `users` (RESTRICT implicite).
 *
 * Rollback manuel documenté (réversible, sans perte de données utilisateur) :
 * ```sql
 * ALTER TABLE user_sessions DROP FOREIGN KEY fk_user_sessions_user_id;
 * ALTER TABLE notifications DROP FOREIGN KEY fk_notifications_user_id;
 * ALTER TABLE chat_participants DROP FOREIGN KEY fk_chat_participants_user_id;
 * ```
 * Les lignes orphelins supprimées par le cleanup initial ne sont pas restaurables ;
 * rejouer un export backup si nécessaire avant rollback en production.
 */

export interface ReferentialIntegrityReport {
  deletedUserSessions: number;
  deletedNotifications: number;
  deletedChatParticipants: number;
}

interface ForeignKeySpec {
  table: string;
  constraintName: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

const CRITICAL_USER_FOREIGN_KEYS: readonly ForeignKeySpec[] = [
  {
    table: 'user_sessions',
    constraintName: 'fk_user_sessions_user_id',
    column: 'userId',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'notifications',
    constraintName: 'fk_notifications_user_id',
    column: 'userId',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'chat_participants',
    constraintName: 'fk_chat_participants_user_id',
    column: 'userId',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
];

async function tableExists(db: DataSource, table: string): Promise<boolean> {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  ) as Array<{ n?: number | string }>;
  return Number(rows[0]?.n) > 0;
}

async function foreignKeyExists(db: DataSource, table: string, constraintName: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraintName],
  ) as Array<{ n?: number | string }>;
  return Number(rows[0]?.n) > 0;
}

/** Supprime les lignes dont la clé étrangère logique ne résout plus d'utilisateur. */
export async function cleanupOrphanedReferentialRows(db: DataSource): Promise<ReferentialIntegrityReport> {
  const report: ReferentialIntegrityReport = {
    deletedUserSessions: 0,
    deletedNotifications: 0,
    deletedChatParticipants: 0,
  };

  if (!(await tableExists(db, 'users'))) {
    return report;
  }

  if (await tableExists(db, 'user_sessions')) {
    const result = await db.query(
      `DELETE us FROM user_sessions us
       LEFT JOIN users u ON u.id = us.userId
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedUserSessions = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'notifications')) {
    const result = await db.query(
      `DELETE n FROM notifications n
       LEFT JOIN users u ON u.id = n.userId
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedNotifications = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'chat_participants')) {
    const result = await db.query(
      `DELETE cp FROM chat_participants cp
       LEFT JOIN users u ON u.id = cp.userId
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedChatParticipants = Number(result?.affectedRows ?? 0);
  }

  return report;
}

/** Pose les FK critiques de façon idempotente (bases déjà migrées ignorées). */
export async function addCriticalUserForeignKeys(db: DataSource): Promise<void> {
  if (!(await tableExists(db, 'users'))) return;

  for (const spec of CRITICAL_USER_FOREIGN_KEYS) {
    if (!(await tableExists(db, spec.table))) continue;
    if (await foreignKeyExists(db, spec.table, spec.constraintName)) continue;

    await db.query(
      `ALTER TABLE \`${spec.table}\`
       ADD CONSTRAINT \`${spec.constraintName}\`
       FOREIGN KEY (\`${spec.column}\`) REFERENCES \`${spec.referencedTable}\` (\`${spec.referencedColumn}\`)
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }
}

export async function enforceCriticalReferentialIntegrity(db: DataSource): Promise<ReferentialIntegrityReport> {
  const report = await cleanupOrphanedReferentialRows(db);
  await addCriticalUserForeignKeys(db);
  return report;
}

export const CRITICAL_USER_FOREIGN_KEY_NAMES = CRITICAL_USER_FOREIGN_KEYS.map((spec) => spec.constraintName);
