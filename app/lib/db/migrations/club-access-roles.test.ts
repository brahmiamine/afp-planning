import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { getDataSource } from '../data-source';
import { isDbAvailable } from '../test-utils';
import { backfillClubAccessRoles, splitLegacyRoles } from './club-access-roles';

const dbAvailable = await isDbAvailable();

describe('splitLegacyRoles (issue #209)', () => {
  it('conserve l’accès administrateur', () => {
    expect(splitLegacyRoles(['admin'])).toEqual({ accessRole: 'admin', planningFunctions: [] });
  });

  it('bascule un compte uniquement terrain en dirigeant', () => {
    expect(splitLegacyRoles(['arbitre'])).toEqual({
      accessRole: 'dirigeant',
      planningFunctions: ['arbitre_club'],
    });
  });

  it('conserve la fonction terrain d’un administrateur qui la cumulait', () => {
    expect(splitLegacyRoles(['admin', 'encadrant'])).toEqual({
      accessRole: 'admin',
      planningFunctions: ['encadrant'],
    });
  });

  it('conserve les trois fonctions d’un dirigeant multi-fonction', () => {
    expect(splitLegacyRoles(['accompagnateur', 'arbitre', 'encadrant'])).toEqual({
      accessRole: 'dirigeant',
      planningFunctions: ['arbitre_club', 'encadrant', 'accompagnateur'],
    });
  });

  it('rabat un compte sans rôle exploitable sur dirigeant sans fonction', () => {
    expect(splitLegacyRoles([])).toEqual({ accessRole: 'dirigeant', planningFunctions: [] });
    expect(splitLegacyRoles(['inconnu'])).toEqual({ accessRole: 'dirigeant', planningFunctions: [] });
  });
});

const usersTable = 'users_access_role_migration_test';
const invitationsTable = 'invitations_access_role_migration_test';
const recordsTable = 'planning_records_access_role_migration_test';

async function dropScratchTables(db: DataSource): Promise<void> {
  await db.query(`DROP TABLE IF EXISTS ${usersTable}`);
  await db.query(`DROP TABLE IF EXISTS ${invitationsTable}`);
  await db.query(`DROP TABLE IF EXISTS ${recordsTable}`);
}

/** Reproduit le schéma hérité (colonne `roles`/`role`) avec les colonnes ajoutées par 0010. */
async function createLegacyTables(db: DataSource): Promise<void> {
  await dropScratchTables(db);
  await db.query(`CREATE TABLE ${usersTable} (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    clubId VARCHAR(64) NOT NULL,
    nom VARCHAR(191) NOT NULL,
    roles TEXT NOT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    accessRole VARCHAR(255) NULL,
    planningFunctions TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE ${invitationsTable} (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    clubId VARCHAR(64) NOT NULL,
    role VARCHAR(64) NOT NULL,
    accessRole VARCHAR(255) NULL,
    planningFunctions TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE ${recordsTable} (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    kind VARCHAR(64) NOT NULL,
    person_id INT NULL,
    payload LONGTEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

interface MigratedUser {
  id: number;
  clubId: string;
  nom: string;
  active: number;
  accessRole: string;
  planningFunctions: string;
}

async function readUsers(db: DataSource): Promise<MigratedUser[]> {
  return db.query(`SELECT id, clubId, nom, active, accessRole, planningFunctions FROM ${usersTable} ORDER BY id`);
}

describe.skipIf(!dbAvailable)('migration 0010 — rôles d’accès et fonctions (intégration MariaDB)', () => {
  beforeEach(async () => {
    const db = await getDataSource();
    await createLegacyTables(db);
    // Deux clubs, tous les cas de figure de l'ancien modèle cumulatif.
    await db.query(`INSERT INTO ${usersTable} (clubId, nom, roles, active) VALUES
      ('club-a', 'Admin pur', '["admin"]', 1),
      ('club-a', 'Admin encadrant', '["admin","encadrant"]', 1),
      ('club-a', 'Dirigeant multi', '["arbitre","encadrant","accompagnateur"]', 1),
      ('club-a', 'Arbitre inactif', '["arbitre"]', 0),
      ('club-b', 'Accompagnateur club B', '["accompagnateur"]', 1),
      ('club-b', 'Compte sans role', '[]', 1)`);
    await db.query(`INSERT INTO ${invitationsTable} (id, clubId, role) VALUES
      ('inv-admin', 'club-a', 'admin'),
      ('inv-encadrant', 'club-a', 'encadrant'),
      ('inv-club-b', 'club-b', 'arbitre')`);
    await db.query(
      `INSERT INTO ${recordsTable} (id, kind, person_id, payload) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        'campaign-1', 'availability-request', null,
        JSON.stringify({ title: 'Week-end', targetRoles: ['arbitre', 'encadrant'] }),
        'assignment-1', 'assignment-swap', 42,
        JSON.stringify({ role: 'arbitre', requester: { personId: 42 } }),
      ],
    );
  });

  afterAll(async () => {
    const db = await getDataSource();
    await dropScratchTables(db);
  });

  async function migrate(db: DataSource) {
    return backfillClubAccessRoles(db, {
      usersTable,
      invitationsTable,
      planningRecordsTable: recordsTable,
    });
  }

  it('répartit rôle d’accès et fonctions sans perdre de compte ni de fonction', async () => {
    const db = await getDataSource();
    const result = await migrate(db);
    expect(result.users).toBe(6);
    expect(result.invitations).toBe(3);

    const users = await readUsers(db);
    expect(users).toHaveLength(6);
    const byName = new Map(users.map((user) => [user.nom, user]));

    expect(byName.get('Admin pur')).toMatchObject({ accessRole: 'admin', planningFunctions: '[]' });
    // Un administrateur qui cumulait une fonction terrain la conserve séparément.
    expect(byName.get('Admin encadrant')).toMatchObject({
      accessRole: 'admin',
      planningFunctions: '["encadrant"]',
    });
    expect(byName.get('Dirigeant multi')).toMatchObject({
      accessRole: 'dirigeant',
      planningFunctions: '["arbitre_club","encadrant","accompagnateur"]',
    });
    expect(byName.get('Compte sans role')).toMatchObject({
      accessRole: 'dirigeant',
      planningFunctions: '[]',
    });
  });

  it('préserve le statut inactif et l’isolation par club', async () => {
    const db = await getDataSource();
    await migrate(db);
    const users = await readUsers(db);
    const byName = new Map(users.map((user) => [user.nom, user]));

    // Un compte inactif reste inactif : la migration ne réactive personne.
    expect(byName.get('Arbitre inactif')).toMatchObject({
      clubId: 'club-a',
      active: 0,
      accessRole: 'dirigeant',
      planningFunctions: '["arbitre_club"]',
    });
    // Aucune fonction ni aucun rôle ne traverse la frontière de club.
    expect(byName.get('Accompagnateur club B')).toMatchObject({
      clubId: 'club-b',
      accessRole: 'dirigeant',
      planningFunctions: '["accompagnateur"]',
    });
    expect(users.filter((user) => user.clubId === 'club-a')).toHaveLength(4);
    expect(users.filter((user) => user.clubId === 'club-b')).toHaveLength(2);
    expect(users.filter((user) => user.clubId === 'club-b' && user.accessRole === 'admin')).toHaveLength(0);
  });

  it('reprend les invitations et le ciblage des campagnes', async () => {
    const db = await getDataSource();
    await migrate(db);

    const invitations = await db.query(
      `SELECT id, accessRole, planningFunctions FROM ${invitationsTable} ORDER BY id`,
    ) as Array<{ id: string; accessRole: string; planningFunctions: string }>;
    expect(invitations).toEqual([
      { id: 'inv-admin', accessRole: 'admin', planningFunctions: '[]' },
      { id: 'inv-club-b', accessRole: 'dirigeant', planningFunctions: '["arbitre_club"]' },
      { id: 'inv-encadrant', accessRole: 'dirigeant', planningFunctions: '["encadrant"]' },
    ]);

    const [campaign] = await db.query(
      `SELECT payload FROM ${recordsTable} WHERE id = 'campaign-1'`,
    ) as Array<{ payload: string }>;
    expect(JSON.parse(campaign!.payload).targetRoles).toEqual(['arbitre_club', 'encadrant']);
  });

  it('laisse intacts les affectations et historiques (personId conservé)', async () => {
    const db = await getDataSource();
    await migrate(db);

    const [assignment] = await db.query(
      `SELECT person_id AS personId, payload FROM ${recordsTable} WHERE id = 'assignment-1'`,
    ) as Array<{ personId: number; payload: string }>;
    expect(Number(assignment!.personId)).toBe(42);
    // Le poste d'affectation (`role`) reste inchangé : seule la fonction du compte change.
    expect(JSON.parse(assignment!.payload)).toEqual({ role: 'arbitre', requester: { personId: 42 } });
  });

  it('est rejouable sans réécrire ni perdre de fonction', async () => {
    const db = await getDataSource();
    await migrate(db);
    const first = await readUsers(db);

    const replay = await migrate(db);
    // Les lignes déjà reprises ne sont plus candidates au backfill.
    expect(replay).toEqual({ users: 0, invitations: 0 });
    expect(await readUsers(db)).toEqual(first);

    const [campaign] = await db.query(
      `SELECT payload FROM ${recordsTable} WHERE id = 'campaign-1'`,
    ) as Array<{ payload: string }>;
    expect(JSON.parse(campaign!.payload).targetRoles).toEqual(['arbitre_club', 'encadrant']);
  });
});
