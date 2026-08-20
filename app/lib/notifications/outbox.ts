import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { NotificationUrgency } from './preferences';

export type OutboxChannel = 'push' | 'email' | 'whatsapp';

export interface NotificationOutboxItem {
  id: string;
  userId: number;
  channel: OutboxChannel;
  type: string;
  title: string;
  message: string;
  eventType: string | null;
  eventId: string | null;
  urgency: NotificationUrgency;
  attempts: number;
}

let outboxReady = false;

async function ensureOutboxTable(db: DataSource): Promise<void> {
  if (outboxReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS planning_notification_outbox (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  outboxReady = true;
}

export async function enqueueNotificationDelivery(
  db: DataSource,
  input: Omit<NotificationOutboxItem, 'id' | 'attempts'>,
): Promise<NotificationOutboxItem> {
  await ensureOutboxTable(db);
  const item: NotificationOutboxItem = { ...input, id: randomUUID(), attempts: 0 };
  await db.query(
    `INSERT INTO planning_notification_outbox
      (id, user_id, channel, notification_type, title, message, event_type, event_id, urgency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.userId, item.channel, item.type, item.title, item.message, item.eventType, item.eventId, item.urgency],
  );
  return item;
}

export async function markNotificationSent(db: DataSource, id: string): Promise<void> {
  await ensureOutboxTable(db);
  await db.query(
    `UPDATE planning_notification_outbox
     SET status = 'sent', attempts = attempts + 1, sent_at = CURRENT_TIMESTAMP(6), last_error = NULL
     WHERE id = ?`,
    [id],
  );
}

export async function markNotificationFailed(db: DataSource, id: string, attempts: number, error: unknown): Promise<void> {
  await ensureOutboxTable(db);
  const message = error instanceof Error ? error.message : 'Erreur de livraison inconnue';
  const delayMinutes = Math.min(360, 2 ** Math.min(attempts, 8));
  await db.query(
    `UPDATE planning_notification_outbox
     SET status = CASE WHEN attempts + 1 >= 10 THEN 'dead' ELSE 'pending' END,
         attempts = attempts + 1,
         next_attempt_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? MINUTE),
         last_error = ?
     WHERE id = ?`,
    [delayMinutes, message.slice(0, 4000), id],
  );
}

export async function listDueNotificationDeliveries(db: DataSource, limit = 100): Promise<NotificationOutboxItem[]> {
  await ensureOutboxTable(db);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const rows = await db.transaction(async (manager) => {
    await manager.query(
      `UPDATE planning_notification_outbox SET status = 'pending'
       WHERE status = 'processing' AND next_attempt_at <= CURRENT_TIMESTAMP(6)`,
    );
    const claimed = await manager.query(
      `SELECT id, user_id AS userId, channel, notification_type AS type, title, message,
         event_type AS eventType, event_id AS eventId, urgency, attempts
       FROM planning_notification_outbox
       WHERE status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP(6)
       ORDER BY created_at ASC LIMIT ${safeLimit} FOR UPDATE`,
    ) as Array<Record<string, unknown>>;
    if (claimed.length) {
      const placeholders = claimed.map(() => '?').join(', ');
      await manager.query(
        `UPDATE planning_notification_outbox
         SET status = 'processing', next_attempt_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 10 MINUTE)
         WHERE id IN (${placeholders})`,
        claimed.map((row) => String(row.id)),
      );
    }
    return claimed;
  });
  return rows.map((row) => ({
    id: String(row.id),
    userId: Number(row.userId),
    channel: row.channel as OutboxChannel,
    type: String(row.type),
    title: String(row.title),
    message: String(row.message),
    eventType: row.eventType === null ? null : String(row.eventType),
    eventId: row.eventId === null ? null : String(row.eventId),
    urgency: row.urgency as NotificationUrgency,
    attempts: Number(row.attempts),
  }));
}
