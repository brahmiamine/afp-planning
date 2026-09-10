import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { getDataSource } from '../data-source';
import { isDbAvailable } from '../test-utils';
import {
  addCriticalUserForeignKeys,
  cleanupOrphanedReferentialRows,
  CRITICAL_USER_FOREIGN_KEY_NAMES,
  enforceCriticalReferentialIntegrity,
} from './referential-integrity';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('referential integrity (issue #350)', () => {
  const scratchPrefix = `fk_test_${randomBytes(4).toString('hex')}`;
  let userId: number;
  let orphanUserId: number;

  beforeEach(async () => {
    const db = await getDataSource();
    orphanUserId = 9_000_000 + Math.floor(Math.random() * 100_000);

    const user = await db.query(
      `INSERT INTO users (clubId, email, passwordHash, nom, accessRole, planningFunctions, active, icalToken)
       VALUES (?, ?, 'hash', 'FK Test User', 'dirigeant', '[]', 1, ?)`,
      [scratchPrefix, `${scratchPrefix}@example.com`, `ical-${scratchPrefix}`],
    );
    userId = Number((user as { insertId?: number }).insertId);

    await db.query(
      'INSERT INTO user_sessions (id, userId, expiresAt) VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL 1 DAY))',
      [`session-valid-${scratchPrefix}`, userId],
    );
    await db.query(
      'INSERT INTO user_sessions (id, userId, expiresAt) VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL 1 DAY))',
      [`session-orphan-${scratchPrefix}`, orphanUserId],
    );
    await db.query(
      `INSERT INTO notifications (userId, type, title, message)
       VALUES (?, 'test', 'Orphelin', 'Notification sans utilisateur')`,
      [orphanUserId],
    );
  });

  afterAll(async () => {
    const db = await getDataSource();
    await db.query('DELETE FROM user_sessions WHERE id LIKE ?', [`%${scratchPrefix}%`]);
    await db.query('DELETE FROM notifications WHERE title IN (?, ?)', ['Orphelin', 'Valide']);
    await db.query('DELETE FROM users WHERE clubId = ?', [scratchPrefix]);
  });

  it('supprime les orphelins avant de poser les contraintes', async () => {
    const db = await getDataSource();
    const report = await cleanupOrphanedReferentialRows(db);

    expect(report.deletedUserSessions).toBeGreaterThanOrEqual(1);
    expect(report.deletedNotifications).toBeGreaterThanOrEqual(1);

    const orphanSessions = await db.query(
      'SELECT id FROM user_sessions WHERE userId = ?',
      [orphanUserId],
    ) as Array<{ id: string }>;
    expect(orphanSessions).toHaveLength(0);
  });

  it('rejette une session orpheline une fois la FK posée', async () => {
    const db = await getDataSource();
    await enforceCriticalReferentialIntegrity(db);

    await expect(
      db.query(
        'INSERT INTO user_sessions (id, userId, expiresAt) VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL 1 DAY))',
        [`session-fk-blocked-${scratchPrefix}`, orphanUserId],
      ),
    ).rejects.toThrow();

    for (const constraintName of CRITICAL_USER_FOREIGN_KEY_NAMES) {
      const rows = await db.query(
        `SELECT CONSTRAINT_NAME AS constraintName FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        [constraintName],
      ) as Array<{ constraintName?: string }>;
      expect(rows.some((row) => row.constraintName === constraintName)).toBe(true);
    }
  });

  it('est idempotent sur une base déjà durcie', async () => {
    const db = await getDataSource();
    await addCriticalUserForeignKeys(db);
    await expect(addCriticalUserForeignKeys(db)).resolves.toBeUndefined();
  });
});
