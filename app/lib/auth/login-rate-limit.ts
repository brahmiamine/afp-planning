import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

/**
 * Limitation de débit à la connexion (issue #274), en base pour rester efficace sur
 * plusieurs instances de l'application — un compteur en mémoire par instance serait
 * contournable en répartissant les tentatives entre elles.
 *
 * Verrouillage progressif : plus les échecs s'accumulent dans la fenêtre courante,
 * plus la durée de blocage s'allonge, plafonnée à 30 minutes.
 */
const THRESHOLDS: ReadonlyArray<{ attempts: number; lockSeconds: number }> = [
  { attempts: 5, lockSeconds: 30 },
  { attempts: 8, lockSeconds: 120 },
  { attempts: 12, lockSeconds: 600 },
  { attempts: 20, lockSeconds: 1800 },
];

/** Sans tentative depuis 15 minutes, la fenêtre repart de zéro (décroissance du compteur). */
const DECAY_WINDOW_MS = 15 * 60 * 1000;

function lockSecondsFor(attempts: number): number | null {
  let lockSeconds: number | null = null;
  for (const threshold of THRESHOLDS) {
    if (attempts >= threshold.attempts) lockSeconds = threshold.lockSeconds;
  }
  return lockSeconds;
}

/** Empreinte SHA-256 : ni l'IP ni l'identité ne sont jamais stockées en clair. */
export function hashBucketComponent(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export interface RateLimitStatus {
  limited: boolean;
  retryAfterSeconds?: number;
}

/** À appeler avant toute vérification d'identifiants : un compte bloqué ne doit même
 * pas laisser deviner s'il existe via un délai de réponse différent. */
export async function checkLoginRateLimit(db: DataSource, bucketKey: string): Promise<RateLimitStatus> {
  const rows = await db.query(
    'SELECT locked_until AS lockedUntil FROM login_rate_limits WHERE bucket_key = ? LIMIT 1',
    [bucketKey],
  ) as Array<{ lockedUntil: Date | string | null }>;
  const lockedUntilRaw = rows[0]?.lockedUntil;
  if (!lockedUntilRaw) return { limited: false };
  const remainingMs = new Date(lockedUntilRaw).getTime() - Date.now();
  if (remainingMs <= 0) return { limited: false };
  return { limited: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

/**
 * Incrémente le compteur d'échecs de façon atomique (l'incrément lui-même est fait en
 * SQL, jamais lu-puis-réécrit côté application) puis, si un palier est franchi, pose
 * le verrou. Deux requêtes concurrentes sur le même bucket peuvent, dans de rares cas,
 * poser deux fois le même verrou (idempotent, sans conséquence) — seul le compteur
 * d'échecs, qui détermine la sévérité du blocage, doit être exact.
 */
export async function recordFailedLoginAttempt(db: DataSource, bucketKey: string): Promise<RateLimitStatus> {
  const now = new Date();
  const decayBoundary = new Date(now.getTime() - DECAY_WINDOW_MS);

  await db.query(
    `INSERT INTO login_rate_limits (bucket_key, attempts, first_attempt_at, last_attempt_at, locked_until)
     VALUES (?, 1, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       attempts = CASE WHEN last_attempt_at < ? THEN 1 ELSE attempts + 1 END,
       first_attempt_at = CASE WHEN last_attempt_at < ? THEN VALUES(last_attempt_at) ELSE first_attempt_at END,
       last_attempt_at = VALUES(last_attempt_at)`,
    [bucketKey, now, now, decayBoundary, decayBoundary],
  );

  const rows = await db.query(
    'SELECT attempts FROM login_rate_limits WHERE bucket_key = ? LIMIT 1',
    [bucketKey],
  ) as Array<{ attempts: number }>;
  const attempts = Number(rows[0]?.attempts ?? 1);
  const lockSeconds = lockSecondsFor(attempts);
  if (!lockSeconds) return { limited: false };

  const lockedUntil = new Date(now.getTime() + lockSeconds * 1000);
  await db.query('UPDATE login_rate_limits SET locked_until = ? WHERE bucket_key = ?', [lockedUntil, bucketKey]);
  return { limited: true, retryAfterSeconds: lockSeconds };
}

/** Connexion réussie : la fenêtre d'échecs de ce bucket n'a plus lieu d'être. */
export async function resetLoginRateLimit(db: DataSource, bucketKey: string): Promise<void> {
  await db.query('DELETE FROM login_rate_limits WHERE bucket_key = ?', [bucketKey]);
}
