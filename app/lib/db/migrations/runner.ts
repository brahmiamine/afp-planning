import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

/**
 * Runner de migrations de schéma versionnées (issue #129).
 *
 * Règles du mécanisme :
 * - les migrations sont ordonnées par `version` strictement croissante et ne sont
 *   exécutées qu'une seule fois (journal dans la table `schema_migrations`) ;
 * - une migration appliquée est **immuable** : son empreinte (version + nom +
 *   instructions SQL) est revérifiée à chaque démarrage, toute modification
 *   exige une nouvelle migration ;
 * - chaque instruction doit être idempotente (`IF NOT EXISTS`, `INSERT IGNORE`…) :
 *   MariaDB ne transactionne pas le DDL, une migration interrompue doit pouvoir
 *   être rejouée sans casse ;
 * - un verrou consultatif (`GET_LOCK`) empêche deux instances applicatives
 *   d'exécuter le DDL simultanément ;
 * - toute erreur est bloquante : l'application refuse de démarrer sur un schéma
 *   incohérent plutôt que de continuer en état dégradé.
 */

export interface SchemaMigration {
  /** Identifiant d'ordre au format '0001', strictement croissant dans le registre. */
  version: string;
  /** Nom fonctionnel lisible (journalisé avec la version). */
  name: string;
  /** Instructions SQL exécutées dans l'ordre, toutes idempotentes. */
  statements: readonly string[];
  /**
   * Logique complémentaire idempotente dépendant de l'existant (backfills).
   * Exécutée après `statements`, dans le même passage.
   */
  up?: (db: DataSource) => Promise<void>;
}

export interface RunSchemaMigrationsOptions {
  /** Table journal des migrations (surtout utile pour les tests). */
  tableName?: string;
  /** Nom du verrou consultatif MariaDB. */
  lockName?: string;
  /** Timeout d'attente du verrou, en secondes. */
  lockTimeoutSeconds?: number;
}

const DEFAULT_TABLE_NAME = 'schema_migrations';
const DEFAULT_LOCK_NAME = 'afp_planning_schema_migrations';
const DEFAULT_LOCK_TIMEOUT_SECONDS = 60;

/** Empreinte immuable d'une migration : version + nom + SQL source. */
export function computeMigrationChecksum(migration: SchemaMigration): string {
  return createHash('sha256')
    .update(`${migration.version}\n${migration.name}\n${migration.statements.join('\n--- statement ---\n')}`)
    .digest('hex');
}

/** Valide le registre avant toute exécution : format, unicité et ordre des versions. */
export function validateMigrationRegistry(migrations: readonly SchemaMigration[]): void {
  const seen = new Set<string>();
  let previous = '';
  for (const migration of migrations) {
    if (!/^\d{4}$/.test(migration.version)) {
      throw new Error(`[migrations] Version invalide « ${migration.version} » (${migration.name}) — format attendu : 4 chiffres, ex. '0007'.`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`[migrations] Version ${migration.version} en double dans le registre (${migration.name}).`);
    }
    if (previous && migration.version <= previous) {
      throw new Error(`[migrations] Registre désordonné : ${migration.version} (${migration.name}) arrive après ${previous}.`);
    }
    if (migration.statements.length === 0 && !migration.up) {
      throw new Error(`[migrations] La migration ${migration.version} (${migration.name}) est vide.`);
    }
    seen.add(migration.version);
    previous = migration.version;
  }
}

/**
 * Applique les migrations manquantes, dans l'ordre du registre.
 * Retourne les versions nouvellement appliquées pendant cet appel.
 */
export async function runSchemaMigrations(
  db: DataSource,
  migrations: readonly SchemaMigration[],
  options: RunSchemaMigrationsOptions = {},
): Promise<string[]> {
  const tableName = options.tableName ?? DEFAULT_TABLE_NAME;
  const lockName = options.lockName ?? DEFAULT_LOCK_NAME;
  const lockTimeout = options.lockTimeoutSeconds ?? DEFAULT_LOCK_TIMEOUT_SECONDS;

  validateMigrationRegistry(migrations);

  const lockRows = await db.query('SELECT GET_LOCK(?, ?) AS acquired', [lockName, lockTimeout]) as Array<{ acquired?: number | string | null }>;
  const acquired = Number(Array.isArray(lockRows) ? lockRows[0]?.acquired ?? 0 : 0);
  if (acquired !== 1) {
    throw new Error(
      `[migrations] Verrou « ${lockName} » non obtenu en ${lockTimeout}s — `
      + 'une autre instance applique peut-être encore les migrations.',
    );
  }

  try {
    // Table journal : seule table créée par le runner lui-même (infrastructure de
    // migration, équivalent de la table `migrations` de TypeORM).
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        version VARCHAR(16) NOT NULL PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const appliedRows = await db.query(
      `SELECT version, checksum FROM ${tableName}`,
    ) as Array<{ version: string; checksum: string }>;
    const appliedChecksums = new Map(appliedRows.map((row) => [String(row.version), String(row.checksum)]));

    // Dérive de schéma : une migration en base ne doit jamais disparaître du registre.
    const registryVersions = new Set(migrations.map((migration) => migration.version));
    for (const row of appliedRows) {
      if (!registryVersions.has(String(row.version))) {
        throw new Error(
          `[migrations] La migration ${row.version} est appliquée en base mais absente du registre applicatif — `
          + 'dérive de schéma, intervention manuelle requise (ne jamais supprimer une migration appliquée).',
        );
      }
    }

    const newlyApplied: string[] = [];
    for (const migration of migrations) {
      const checksum = computeMigrationChecksum(migration);
      const existingChecksum = appliedChecksums.get(migration.version);
      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `[migrations] La migration ${migration.version} (${migration.name}) a été modifiée après application — `
            + 'les migrations sont immuables, créez une nouvelle migration.',
          );
        }
        continue;
      }

      for (const statement of migration.statements) {
        await db.query(statement);
      }
      if (migration.up) {
        await migration.up(db);
      }
      await db.query(
        `INSERT INTO ${tableName} (version, name, checksum) VALUES (?, ?, ?)`,
        [migration.version, migration.name, checksum],
      );
      newlyApplied.push(migration.version);
      console.warn(`[migrations] ${migration.version} (${migration.name}) appliquée.`);
    }

    return newlyApplied;
  } finally {
    await db.query('SELECT RELEASE_LOCK(?) AS released', [lockName]).catch(() => undefined);
  }
}
