import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import {
  checkLoginRateLimit,
  hashBucketComponent,
  recordFailedLoginAttempt,
  resetLoginRateLimit,
} from './login-rate-limit';

const dbAvailable = await isDbAvailable();

describe('hashBucketComponent', () => {
  it('normalise la casse et les espaces avant de hacher (même bucket pour Admin@X.com et admin@x.com )', () => {
    expect(hashBucketComponent('Admin@Example.com')).toBe(hashBucketComponent(' admin@example.com'));
  });

  it('produit des empreintes distinctes pour des valeurs distinctes', () => {
    expect(hashBucketComponent('a')).not.toBe(hashBucketComponent('b'));
  });
});

// Chaque test génère un bucket dédié (aléatoire) : pas de nettoyage partagé
// nécessaire au-delà de la ligne de ce bucket, supprimée en fin de test.
describe.skipIf(!dbAvailable)('login rate limit (issue #274)', () => {
  function freshBucket(): string {
    return `test:${randomBytes(8).toString('hex')}`;
  }

  it("n'est pas limité tant qu'aucune tentative n'a échoué", async () => {
    const db = await getDb();
    const bucket = freshBucket();
    const status = await checkLoginRateLimit(db, bucket);
    expect(status.limited).toBe(false);
  });

  it('ne verrouille pas avant le premier palier (5 échecs)', async () => {
    const db = await getDb();
    const bucket = freshBucket();
    try {
      for (let i = 0; i < 4; i += 1) {
        const result = await recordFailedLoginAttempt(db, bucket);
        expect(result.limited).toBe(false);
      }
      expect((await checkLoginRateLimit(db, bucket)).limited).toBe(false);
    } finally {
      await resetLoginRateLimit(db, bucket);
    }
  });

  it('verrouille au 5e échec, avec un délai de nouvelle tentative croissant', async () => {
    const db = await getDb();
    const bucket = freshBucket();
    try {
      let lastResult;
      for (let i = 0; i < 5; i += 1) {
        lastResult = await recordFailedLoginAttempt(db, bucket);
      }
      expect(lastResult!.limited).toBe(true);
      expect(lastResult!.retryAfterSeconds).toBeGreaterThan(0);

      const status = await checkLoginRateLimit(db, bucket);
      expect(status.limited).toBe(true);
      expect(status.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await resetLoginRateLimit(db, bucket);
    }
  });

  it('allonge le verrouillage aux paliers suivants', async () => {
    const db = await getDb();
    const bucket = freshBucket();
    try {
      let atFive;
      for (let i = 0; i < 5; i += 1) atFive = await recordFailedLoginAttempt(db, bucket);
      let atEight;
      for (let i = 0; i < 3; i += 1) atEight = await recordFailedLoginAttempt(db, bucket);

      expect(atEight!.retryAfterSeconds!).toBeGreaterThan(atFive!.retryAfterSeconds!);
    } finally {
      await resetLoginRateLimit(db, bucket);
    }
  });

  it('une connexion réussie réinitialise le compteur (plus aucune limite ensuite)', async () => {
    const db = await getDb();
    const bucket = freshBucket();
    for (let i = 0; i < 5; i += 1) await recordFailedLoginAttempt(db, bucket);
    expect((await checkLoginRateLimit(db, bucket)).limited).toBe(true);

    await resetLoginRateLimit(db, bucket);
    expect((await checkLoginRateLimit(db, bucket)).limited).toBe(false);

    // La fenêtre repart réellement de zéro : quatre nouveaux échecs (sous le palier)
    // ne reverrouillent pas immédiatement.
    for (let i = 0; i < 4; i += 1) {
      const result = await recordFailedLoginAttempt(db, bucket);
      expect(result.limited).toBe(false);
    }
    await resetLoginRateLimit(db, bucket);
  });

  it('un verrou déjà expiré (dans le passé) ne bloque plus une nouvelle tentative', async () => {
    const db = await getDb();
    const bucket = freshBucket();
    try {
      const now = new Date();
      await db.query(
        `INSERT INTO login_rate_limits (bucket_key, attempts, first_attempt_at, last_attempt_at, locked_until)
         VALUES (?, ?, ?, ?, ?)`,
        [bucket, 20, now, now, new Date(now.getTime() - 1000)],
      );
      const status = await checkLoginRateLimit(db, bucket);
      expect(status.limited).toBe(false);
    } finally {
      await resetLoginRateLimit(db, bucket);
    }
  });

  it("une tentative très ancienne (hors fenêtre de décroissance) fait repartir le compteur de zéro", async () => {
    const db = await getDb();
    const bucket = freshBucket();
    try {
      const longAgo = new Date(Date.now() - 60 * 60 * 1000);
      await db.query(
        `INSERT INTO login_rate_limits (bucket_key, attempts, first_attempt_at, last_attempt_at, locked_until)
         VALUES (?, ?, ?, ?, NULL)`,
        [bucket, 4, longAgo, longAgo],
      );
      // Un 5e échec juste après une vieille tentative isolée ne doit pas verrouiller :
      // la fenêtre de 15 minutes est dépassée, le compteur repart de 1.
      const result = await recordFailedLoginAttempt(db, bucket);
      expect(result.limited).toBe(false);

      const rows = await db.query('SELECT attempts FROM login_rate_limits WHERE bucket_key = ?', [bucket]) as Array<{ attempts: number }>;
      expect(Number(rows[0]?.attempts)).toBe(1);
    } finally {
      await resetLoginRateLimit(db, bucket);
    }
  });
});
