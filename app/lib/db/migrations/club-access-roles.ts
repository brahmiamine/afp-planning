import type { DataSource } from 'typeorm';
import {
  ALL_PLANNING_FUNCTIONS,
  type ClubAccessRole,
  type PlanningFunction,
} from '@/lib/auth/roles';

/**
 * Migration 0010 (issue #209) — séparation du rôle d'accès et des fonctions terrain.
 *
 * L'ancien modèle stockait un tableau cumulatif `roles` mélangeant permission
 * (`admin`) et fonctions opérationnelles (`arbitre`, `encadrant`, `accompagnateur`).
 * Le nouveau modèle porte un rôle d'accès unique (`accessRole`) et une liste de
 * fonctions cumulables (`planningFunctions`), sur `users` comme sur `invitations`.
 *
 * Règles de reprise :
 * - un compte `admin` garde le rôle d'accès `admin` ;
 * - tout compte uniquement terrain devient `dirigeant` ;
 * - chaque ancien rôle terrain est recopié en fonction, y compris pour un admin qui
 *   cumulait une fonction terrain ;
 * - un compte sans rôle exploitable devient `dirigeant` sans fonction.
 *
 * Les colonnes sont ajoutées nullables (une colonne NOT NULL ne peut pas être créée
 * sur une table remplie) puis remplies ici ; `synchronize`, exécuté après le runner,
 * les durcit et supprime l'ancienne colonne `roles`. La migration est rejouable :
 * elle ne réécrit que les lignes dont le rôle d'accès n'est pas encore renseigné et
 * ne fait rien si la colonne héritée a déjà disparu.
 */

/** Correspondance ancien rôle terrain → fonction opérationnelle. */
const FUNCTION_BY_LEGACY_ROLE: Record<string, PlanningFunction> = {
  arbitre: 'arbitre_club',
  encadrant: 'encadrant',
  accompagnateur: 'accompagnateur',
};

export interface LegacyRolesSplit {
  accessRole: ClubAccessRole;
  planningFunctions: PlanningFunction[];
}

/** Répartit un ancien tableau `roles` entre rôle d'accès et fonctions opérationnelles. */
export function splitLegacyRoles(value: unknown): LegacyRolesSplit {
  const list = Array.isArray(value) ? value : [value];
  const held = new Set<PlanningFunction>();
  let accessRole: ClubAccessRole = 'dirigeant';
  for (const role of list) {
    if (role === 'admin') {
      accessRole = 'admin';
      continue;
    }
    const planningFunction = typeof role === 'string' ? FUNCTION_BY_LEGACY_ROLE[role] : undefined;
    if (planningFunction) held.add(planningFunction);
  }
  return { accessRole, planningFunctions: ALL_PLANNING_FUNCTIONS.filter((fn) => held.has(fn)) };
}

function parseLegacyRoles(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    return JSON.parse(raw);
  } catch {
    // `simple-json` sérialise toujours du JSON ; une valeur illisible est traitée
    // comme un compte sans rôle exploitable plutôt que de bloquer la migration.
    return [];
  }
}

async function hasTable(db: DataSource, table: string): Promise<boolean> {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES '
    + 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return Number(rows[0]?.n) > 0;
}

async function hasColumn(db: DataSource, table: string, column: string): Promise<boolean> {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS '
    + 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  );
  return Number(rows[0]?.n) > 0;
}

export interface ClubAccessRolesBackfillResult {
  users: number;
  invitations: number;
}

/**
 * Reprend une table portant l'ancien modèle : lit la colonne héritée, écrit rôle
 * d'accès et fonctions, puis élimine tout NULL résiduel (ligne créée entre l'ALTER
 * et le backfill, base neuve) avant que `synchronize` ne durcisse les colonnes.
 */
async function backfillTable(
  db: DataSource,
  table: string,
  legacyColumn: string,
  toLegacyRoles: (raw: unknown) => unknown,
): Promise<number> {
  let migrated = 0;
  if (await hasColumn(db, table, legacyColumn)) {
    const rows = await db.query(
      `SELECT id, ${legacyColumn} AS legacy FROM ${table} WHERE accessRole IS NULL OR accessRole = ''`,
    ) as Array<{ id: number | string; legacy: unknown }>;
    for (const row of rows) {
      const { accessRole, planningFunctions } = splitLegacyRoles(toLegacyRoles(row.legacy));
      await db.query(
        `UPDATE ${table} SET accessRole = ?, planningFunctions = ? WHERE id = ?`,
        [accessRole, JSON.stringify(planningFunctions), row.id],
      );
      migrated += 1;
    }
  }
  await db.query(`UPDATE ${table} SET accessRole = 'dirigeant' WHERE accessRole IS NULL OR accessRole = ''`);
  await db.query(`UPDATE ${table} SET planningFunctions = '[]' WHERE planningFunctions IS NULL`);
  return migrated;
}

export interface ClubAccessRolesBackfillOptions {
  /** Noms de tables surchargeables, pour éprouver la reprise sur des tables de test. */
  usersTable?: string;
  invitationsTable?: string;
  planningRecordsTable?: string;
}

export async function backfillClubAccessRoles(
  db: DataSource,
  options: ClubAccessRolesBackfillOptions = {},
): Promise<ClubAccessRolesBackfillResult> {
  const usersTable = options.usersTable ?? 'users';
  const invitationsTable = options.invitationsTable ?? 'invitations';
  const planningRecordsTable = options.planningRecordsTable ?? 'planning_records';

  // Sur une base neuve les tables d'entités n'existent pas encore (elles sont créées
  // par `synchronize`, après le runner) : il n'y a alors rien à reprendre.
  const users = (await hasTable(db, usersTable))
    ? await backfillTable(db, usersTable, 'roles', parseLegacyRoles)
    : 0;
  const invitations = (await hasTable(db, invitationsTable))
    ? await backfillTable(db, invitationsTable, 'role', (raw) => [raw])
    : 0;

  // Campagnes de disponibilité : `targetRoles` désigne désormais des fonctions.
  // Seules ces valeurs peuvent contenir le jeton `"arbitre"` dans ce payload, et
  // `"arbitre_club"` ne le contient pas — le remplacement est donc rejouable.
  if (await hasTable(db, planningRecordsTable)) {
    await db.query(
      `UPDATE ${planningRecordsTable} SET payload = REPLACE(payload, '"arbitre"', '"arbitre_club"') `
      + 'WHERE kind = \'availability-request\' AND payload LIKE \'%"arbitre"%\'',
    );
  }

  return { users, invitations };
}
