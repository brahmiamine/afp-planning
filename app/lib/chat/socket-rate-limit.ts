import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

function hashBucketComponent(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 48);
}

function lockNameForBucket(bucketKey: string): string {
  return `chat-rl:${createHash('sha256').update(bucketKey).digest('hex').slice(0, 48)}`;
}

export function globalHandshakeBucketKey(): string {
  return 'handshake:global';
}

export function handshakeBucketKey(clientAddress: string): string {
  return `handshake:ip:${hashBucketComponent(clientAddress)}`;
}

export function userActionBucketKey(userId: number): string {
  return `actions:user:${userId}`;
}

export function userMessageBucketKey(userId: number): string {
  return `messages:user:${userId}`;
}

export function userTypingBucketKey(userId: number): string {
  return `typing:user:${userId}`;
}

export async function acceptsSharedSlidingLimit(
  db: DataSource,
  bucketKey: string,
  maximum: number,
  windowMs: number,
): Promise<boolean> {
  const runner = db.createQueryRunner();
  const lockName = lockNameForBucket(bucketKey);
  let lockAcquired = false;
  await runner.connect();
  try {
    const lockRows = await runner.query('SELECT GET_LOCK(?, 2) AS acquired', [lockName]) as Array<{ acquired?: unknown }>;
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) return false;

    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    await runner.query(
      `DELETE FROM chat_rate_limit_events
       WHERE bucket_key = ?
         AND created_at < TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6))`,
      [bucketKey, -windowSeconds],
    );
    const countRows = await runner.query(
      'SELECT COUNT(*) AS eventCount FROM chat_rate_limit_events WHERE bucket_key = ?',
      [bucketKey],
    ) as Array<{ eventCount?: number | string }>;
    if (Number(countRows[0]?.eventCount ?? 0) >= maximum) return false;

    await runner.query('INSERT INTO chat_rate_limit_events (bucket_key) VALUES (?)', [bucketKey]);
    return true;
  } finally {
    if (lockAcquired) await runner.query('SELECT RELEASE_LOCK(?)', [lockName]);
    await runner.release();
  }
}

export async function acceptsSharedHandshake(
  db: DataSource,
  clientAddress: string,
  options: {
    globalMaximum?: number;
    perAddressMaximum?: number;
    windowMs?: number;
  } = {},
): Promise<boolean> {
  const windowMs = options.windowMs ?? 10_000;
  const globalMaximum = options.globalMaximum ?? 2_000;
  const perAddressMaximum = options.perAddressMaximum ?? 40;

  if (!(await acceptsSharedSlidingLimit(db, globalHandshakeBucketKey(), globalMaximum, windowMs))) {
    return false;
  }
  return acceptsSharedSlidingLimit(db, handshakeBucketKey(clientAddress), perAddressMaximum, windowMs);
}

export async function purgeSharedRateLimitBucket(db: DataSource, bucketKey: string): Promise<void> {
  await db.query('DELETE FROM chat_rate_limit_events WHERE bucket_key = ?', [bucketKey]);
}
