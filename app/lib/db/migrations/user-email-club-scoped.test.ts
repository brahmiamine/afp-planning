import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDataSource } from '../data-source';
import { isDbAvailable } from '../test-utils';
import { scopeTableEmailUniquenessToClub } from './user-email-club-scoped';

const dbAvailable = await isDbAvailable();

const scratchTable = 'users_email_club_scoped_migration_test';
const compositeIndexName = 'uq_users_email_club_scoped_migration_test';

describe.skipIf(!dbAvailable)('scopeTableEmailUniquenessToClub (issue #266)', () => {
  beforeEach(async () => {
    const db = await getDataSource();
    await db.query(`DROP TABLE IF EXISTS ${scratchTable}`);
  });

  afterAll(async () => {
    const db = await getDataSource();
    await db.query(`DROP TABLE IF EXISTS ${scratchTable}`);
  });

  /** Reproduit l'ancien schéma : `email` unique globalement (avant la migration 0017). */
  async function createLegacyTable() {
    const db = await getDataSource();
    await db.query(`CREATE TABLE ${scratchTable} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      clubId VARCHAR(64) NOT NULL,
      email VARCHAR(191) NOT NULL,
      UNIQUE KEY legacy_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    return db;
  }

  async function indexNames(table: string): Promise<string[]> {
    const db = await getDataSource();
    const rows = await db.query(
      `SELECT DISTINCT INDEX_NAME AS indexName FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    ) as Array<{ indexName?: string }>;
    return rows.map((row) => String(row.indexName));
  }

  it('remplace l\'ancien index unique global sur email par un index composite (clubId, email)', async () => {
    const db = await createLegacyTable();
    await db.query(`INSERT INTO ${scratchTable} (clubId, email) VALUES (?, ?), (?, ?)`, [
      'club-a', 'dirigeant@example.com',
      'club-b', 'autre@example.com',
    ]);

    await scopeTableEmailUniquenessToClub(db, scratchTable, compositeIndexName);

    const names = await indexNames(scratchTable);
    expect(names).not.toContain('legacy_email_unique');
    expect(names).toContain(compositeIndexName);

    // Le même email peut désormais exister dans deux clubs différents.
    await expect(
      db.query(`INSERT INTO ${scratchTable} (clubId, email) VALUES (?, ?)`, ['club-b', 'dirigeant@example.com']),
    ).resolves.toBeDefined();

    // ... mais pas deux fois dans le même club.
    await expect(
      db.query(`INSERT INTO ${scratchTable} (clubId, email) VALUES (?, ?)`, ['club-a', 'dirigeant@example.com']),
    ).rejects.toThrow();
  });

  it('est rejouable sans effet une fois déjà appliquée', async () => {
    const db = await createLegacyTable();
    await db.query(`INSERT INTO ${scratchTable} (clubId, email) VALUES (?, ?)`, ['club-a', 'dirigeant@example.com']);

    await scopeTableEmailUniquenessToClub(db, scratchTable, compositeIndexName);
    await expect(scopeTableEmailUniquenessToClub(db, scratchTable, compositeIndexName)).resolves.toBeUndefined();

    const names = await indexNames(scratchTable);
    expect(names.filter((name) => name === compositeIndexName)).toHaveLength(1);
  });

  it('ignore une table absente (base neuve, créée ensuite par synchronize)', async () => {
    const db = await getDataSource();
    await expect(scopeTableEmailUniquenessToClub(db, scratchTable, compositeIndexName)).resolves.toBeUndefined();
  });

  it('refuse de continuer si une collision (clubId, email) existe déjà', async () => {
    const db = await getDataSource();
    // Table déjà dépourvue de l'ancienne contrainte unique globale — reproduit une
    // base qui aurait été éditée hors du contrôle applicatif (voir la note de
    // sûreté dans user-email-club-scoped.ts).
    await db.query(`CREATE TABLE ${scratchTable} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      clubId VARCHAR(64) NOT NULL,
      email VARCHAR(191) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`INSERT INTO ${scratchTable} (clubId, email) VALUES (?, ?), (?, ?)`, [
      'club-a', 'doublon@example.com',
      'club-a', 'doublon@example.com',
    ]);

    await expect(scopeTableEmailUniquenessToClub(db, scratchTable, compositeIndexName)).rejects.toThrow(/collision/);
  });
});
