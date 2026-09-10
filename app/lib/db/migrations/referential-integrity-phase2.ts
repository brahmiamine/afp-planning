import type { DataSource } from 'typeorm';

/**
 * Migration 0022 (issue #385) : intégrité référentielle phase 2.
 *
 * Complète la phase 1 (#350) avec les agrégats restants à risque :
 * push, outbox, reset tokens, chat (messages, read-state, pièces jointes).
 *
 * ON DELETE CASCADE : dépendances directes d'un utilisateur supprimé physiquement
 * (cas rare après contrôle findUserReferences). Pas de cascade sur l'audit/archives.
 */

export interface ReferentialIntegrityPhase2Report {
  deletedPushSubscriptions: number;
  deletedOutboxRows: number;
  deletedPasswordResetTokens: number;
  deletedChatReadStates: number;
  deletedChatMessages: number;
  deletedChatAttachments: number;
}

interface ForeignKeySpec {
  table: string;
  constraintName: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

const PHASE2_USER_FOREIGN_KEYS: readonly ForeignKeySpec[] = [
  {
    table: 'push_subscriptions',
    constraintName: 'fk_push_subscriptions_user_id',
    column: 'user_id',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'planning_notification_outbox',
    constraintName: 'fk_notification_outbox_user_id',
    column: 'user_id',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'password_reset_tokens',
    constraintName: 'fk_password_reset_tokens_user_id',
    column: 'userId',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'chat_read_states',
    constraintName: 'fk_chat_read_states_user_id',
    column: 'userId',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'chat_messages',
    constraintName: 'fk_chat_messages_sender_user_id',
    column: 'senderUserId',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'chat_attachments',
    constraintName: 'fk_chat_attachments_user_id',
    column: 'uploaded_by_user_id',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    table: 'invitations',
    constraintName: 'fk_invitations_created_by_user_id',
    column: 'createdByUserId',
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

export async function cleanupOrphanedPhase2Rows(db: DataSource): Promise<ReferentialIntegrityPhase2Report> {
  const report: ReferentialIntegrityPhase2Report = {
    deletedPushSubscriptions: 0,
    deletedOutboxRows: 0,
    deletedPasswordResetTokens: 0,
    deletedChatReadStates: 0,
    deletedChatMessages: 0,
    deletedChatAttachments: 0,
  };

  if (!(await tableExists(db, 'users'))) return report;

  if (await tableExists(db, 'push_subscriptions')) {
    const result = await db.query(
      `DELETE ps FROM push_subscriptions ps
       LEFT JOIN users u ON u.id = ps.user_id
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedPushSubscriptions = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'planning_notification_outbox')) {
    const result = await db.query(
      `DELETE o FROM planning_notification_outbox o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedOutboxRows = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'password_reset_tokens')) {
    const result = await db.query(
      `DELETE prt FROM password_reset_tokens prt
       LEFT JOIN users u ON u.id = prt.userId
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedPasswordResetTokens = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'chat_read_states')) {
    const result = await db.query(
      `DELETE crs FROM chat_read_states crs
       LEFT JOIN users u ON u.id = crs.userId
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedChatReadStates = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'chat_messages')) {
    const result = await db.query(
      `DELETE cm FROM chat_messages cm
       LEFT JOIN users u ON u.id = cm.senderUserId
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedChatMessages = Number(result?.affectedRows ?? 0);
  }

  if (await tableExists(db, 'chat_attachments')) {
    const result = await db.query(
      `DELETE ca FROM chat_attachments ca
       LEFT JOIN users u ON u.id = ca.uploaded_by_user_id
       WHERE u.id IS NULL`,
    ) as { affectedRows?: number };
    report.deletedChatAttachments = Number(result?.affectedRows ?? 0);
  }

  return report;
}

export async function addPhase2UserForeignKeys(db: DataSource): Promise<void> {
  if (!(await tableExists(db, 'users'))) return;

  for (const spec of PHASE2_USER_FOREIGN_KEYS) {
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

export async function enforcePhase2ReferentialIntegrity(db: DataSource): Promise<ReferentialIntegrityPhase2Report> {
  const report = await cleanupOrphanedPhase2Rows(db);
  await addPhase2UserForeignKeys(db);
  return report;
}

export const PHASE2_USER_FOREIGN_KEY_NAMES = PHASE2_USER_FOREIGN_KEYS.map((spec) => spec.constraintName);
