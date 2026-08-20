import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

export interface BrowserPushSubscription {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export interface StoredPushSubscription {
  endpoint: string;
  endpointHash: string;
}

let tableReady = false;
let tableReadyPromise: Promise<void> | null = null;

function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

async function ensurePushSubscriptionsTable(db: DataSource): Promise<void> {
  if (tableReady) return;
  if (tableReadyPromise) return tableReadyPromise;

  tableReadyPromise = db
    .query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    .then(() => {
      tableReady = true;
    })
    .finally(() => {
      tableReadyPromise = null;
    });

  return tableReadyPromise;
}

export async function savePushSubscription(
  db: DataSource,
  userId: number,
  subscription: BrowserPushSubscription,
  userAgent: string | null,
): Promise<void> {
  await ensurePushSubscriptionsTable(db);
  const endpointHash = hashEndpoint(subscription.endpoint);

  await db.query(
    `
      INSERT INTO push_subscriptions
        (user_id, endpoint_hash, endpoint, p256dh, auth_secret, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        endpoint = VALUES(endpoint),
        p256dh = VALUES(p256dh),
        auth_secret = VALUES(auth_secret),
        user_agent = VALUES(user_agent),
        updated_at = CURRENT_TIMESTAMP(6)
    `,
    [
      userId,
      endpointHash,
      subscription.endpoint,
      subscription.keys?.p256dh ?? null,
      subscription.keys?.auth ?? null,
      userAgent,
    ],
  );
}

export async function removePushSubscription(
  db: DataSource,
  userId: number,
  endpoint: string,
): Promise<void> {
  await ensurePushSubscriptionsTable(db);
  await db.query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [
    userId,
    hashEndpoint(endpoint),
  ]);
}

export async function removePushSubscriptionByEndpoint(
  db: DataSource,
  endpoint: string,
): Promise<void> {
  await ensurePushSubscriptionsTable(db);
  await db.query('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [hashEndpoint(endpoint)]);
}

export async function listPushSubscriptionsForUser(
  db: DataSource,
  userId: number,
): Promise<StoredPushSubscription[]> {
  await ensurePushSubscriptionsTable(db);
  const rows = (await db.query(
    'SELECT endpoint, endpoint_hash AS endpointHash FROM push_subscriptions WHERE user_id = ?',
    [userId],
  )) as StoredPushSubscription[];

  return rows;
}
