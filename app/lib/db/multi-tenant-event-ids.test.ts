import { afterAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { isDbAvailable } from './test-utils';
import { getDb } from './index';
import { convertTablePrimaryKeyToTenantScoped, primaryKeyColumns } from './migrations/event-primary-keys';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from './schemas';

/**
 * Tests d'intégration de l'issue #125 : identifiants d'événements réellement
 * multi-tenant. Deux clubs doivent pouvoir stocker le même eventId / matchId
 * sans collision, avec lecture, édition et suppression indépendantes — garanti
 * physiquement par les clés primaires composites (clubId, id).
 */
const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('identifiants d’événements multi-tenant (integration)', () => {
  const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const clubA = `test-club-a-${runSuffix}`;
  const clubB = `test-club-b-${runSuffix}`;
  const sharedEventId = `shared-event-${runSuffix}`;

  afterAll(async () => {
    const db = await getDb();
    // Nettoyage des lignes créées par ce fichier (les deux clubs de test).
    await db.getRepository('MatchOfficial').delete([{ clubId: clubA }, { clubId: clubB }]);
    await db.getRepository('MatchAmical').delete([{ clubId: clubA }, { clubId: clubB }]);
    await db.getRepository('Entrainement').delete([{ clubId: clubA }, { clubId: clubB }]);
    await db.getRepository('Plateau').delete([{ clubId: clubA }, { clubId: clubB }]);
    await db.getRepository('MatchExtra').delete([{ clubId: clubA }, { clubId: clubB }]);
  });

  it('les clés primaires physiques sont composites (clubId, clé métier)', async () => {
    const db = await getDb();
    const rows = await db.query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = 'PRIMARY'
         AND TABLE_NAME IN ('matches_officiels', 'matches_amicaux', 'entrainements', 'plateaux', 'matches_extras')
       ORDER BY TABLE_NAME, SEQ_IN_INDEX`,
    ) as Array<{ tableName: string; columnName: string }>;

    const pkByTable = new Map<string, string[]>();
    for (const row of rows) {
      pkByTable.set(row.tableName, [...(pkByTable.get(row.tableName) ?? []), row.columnName]);
    }
    expect(pkByTable.get('matches_officiels')).toEqual(['clubId', 'id']);
    expect(pkByTable.get('matches_amicaux')).toEqual(['clubId', 'id']);
    expect(pkByTable.get('entrainements')).toEqual(['clubId', 'id']);
    expect(pkByTable.get('plateaux')).toEqual(['clubId', 'id']);
    expect(pkByTable.get('matches_extras')).toEqual(['clubId', 'matchId']);
  });

  it('la migration 0008 est journalisée', async () => {
    const db = await getDb();
    const rows = await db.query(
      `SELECT version, name FROM schema_migrations WHERE version = '0008'`,
    ) as Array<{ version: string; name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('cles_primaires_evenements_tenant_scoped');
  });

  it('deux clubs stockent le même eventId sans collision (matches officiels)', async () => {
    const db = await getDb();
    const repo = db.getRepository<MatchOfficialEntity>('MatchOfficial');

    await repo.save({
      clubId: clubA,
      id: sharedEventId,
      date: '12/01/2026',
      time: '15:00',
      payload: { id: sharedEventId, localTeam: 'Club A', awayTeam: 'Adversaire A' },
    });
    await repo.save({
      clubId: clubB,
      id: sharedEventId,
      date: '12/01/2026',
      time: '18:00',
      payload: { id: sharedEventId, localTeam: 'Club B', awayTeam: 'Adversaire B' },
    });

    const rowA = await repo.findOneBy({ clubId: clubA, id: sharedEventId });
    const rowB = await repo.findOneBy({ clubId: clubB, id: sharedEventId });
    expect(rowA?.payload).toMatchObject({ localTeam: 'Club A' });
    expect(rowB?.payload).toMatchObject({ localTeam: 'Club B' });
    expect(rowA?.time).toBe('15:00');
    expect(rowB?.time).toBe('18:00');
  });

  it('l’édition dans le club A ne modifie jamais le club B', async () => {
    const db = await getDb();
    const repo = db.getRepository<MatchOfficialEntity>('MatchOfficial');

    const rowA = await repo.findOneBy({ clubId: clubA, id: sharedEventId });
    expect(rowA).not.toBeNull();
    await repo.save({
      ...rowA,
      time: '16:30',
      payload: { ...(rowA?.payload as Record<string, unknown>), localTeam: 'Club A renommé' },
    });

    const updatedA = await repo.findOneBy({ clubId: clubA, id: sharedEventId });
    const unchangedB = await repo.findOneBy({ clubId: clubB, id: sharedEventId });
    expect(updatedA?.payload).toMatchObject({ localTeam: 'Club A renommé' });
    expect(updatedA?.time).toBe('16:30');
    expect(unchangedB?.payload).toMatchObject({ localTeam: 'Club B' });
    expect(unchangedB?.time).toBe('18:00');
  });

  it('deux clubs stockent le même matchId dans matches_extras, indépendamment', async () => {
    const db = await getDb();
    const repo = db.getRepository<MatchExtraEntity>('MatchExtra');

    await repo.save({ clubId: clubA, matchId: sharedEventId, payload: { id: sharedEventId, planningStatus: 'draft' } });
    await repo.save({ clubId: clubB, matchId: sharedEventId, payload: { id: sharedEventId, planningStatus: 'published' } });

    const extraA = await repo.findOneBy({ clubId: clubA, matchId: sharedEventId });
    const extraB = await repo.findOneBy({ clubId: clubB, matchId: sharedEventId });
    expect(extraA?.payload).toMatchObject({ planningStatus: 'draft' });
    expect(extraB?.payload).toMatchObject({ planningStatus: 'published' });

    // Édition côté B seulement.
    await repo.save({ clubId: clubB, matchId: sharedEventId, payload: { id: sharedEventId, planningStatus: 'modified' } });
    const rereadA = await repo.findOneBy({ clubId: clubA, matchId: sharedEventId });
    expect(rereadA?.payload).toMatchObject({ planningStatus: 'draft' });
  });

  it('amicaux, entraînements et plateaux acceptent le même eventId dans deux clubs', async () => {
    const db = await getDb();
    const amicalRepo = db.getRepository<MatchAmicalEntity>('MatchAmical');
    const entrainementRepo = db.getRepository<EntrainementEntity>('Entrainement');
    const plateauRepo = db.getRepository<PlateauEntity>('Plateau');

    await amicalRepo.save({ clubId: clubA, id: sharedEventId, date: '13/01/2026', time: '', payload: { id: sharedEventId, marker: 'A' } });
    await amicalRepo.save({ clubId: clubB, id: sharedEventId, date: '13/01/2026', time: '', payload: { id: sharedEventId, marker: 'B' } });
    await entrainementRepo.save({ clubId: clubA, id: sharedEventId, date: '14/01/2026', time: '', payload: { id: sharedEventId, marker: 'A' } });
    await entrainementRepo.save({ clubId: clubB, id: sharedEventId, date: '14/01/2026', time: '', payload: { id: sharedEventId, marker: 'B' } });
    await plateauRepo.save({ clubId: clubA, id: sharedEventId, date: '15/01/2026', time: '', payload: { id: sharedEventId, marker: 'A' } });
    await plateauRepo.save({ clubId: clubB, id: sharedEventId, date: '15/01/2026', time: '', payload: { id: sharedEventId, marker: 'B' } });

    expect((await amicalRepo.findOneBy({ clubId: clubA, id: sharedEventId }))?.payload).toMatchObject({ marker: 'A' });
    expect((await amicalRepo.findOneBy({ clubId: clubB, id: sharedEventId }))?.payload).toMatchObject({ marker: 'B' });
    expect((await entrainementRepo.findOneBy({ clubId: clubA, id: sharedEventId }))?.payload).toMatchObject({ marker: 'A' });
    expect((await entrainementRepo.findOneBy({ clubId: clubB, id: sharedEventId }))?.payload).toMatchObject({ marker: 'B' });
    expect((await plateauRepo.findOneBy({ clubId: clubA, id: sharedEventId }))?.payload).toMatchObject({ marker: 'A' });
    expect((await plateauRepo.findOneBy({ clubId: clubB, id: sharedEventId }))?.payload).toMatchObject({ marker: 'B' });
  });

  it('une suppression dans le club A ne touche jamais le club B', async () => {
    const db = await getDb();
    const repo = db.getRepository<MatchOfficialEntity>('MatchOfficial');

    const rowA = await repo.findOneBy({ clubId: clubA, id: sharedEventId });
    expect(rowA).not.toBeNull();
    await repo.remove(rowA as MatchOfficialEntity);

    expect(await repo.findOneBy({ clubId: clubA, id: sharedEventId })).toBeNull();
    const stillThereB = await repo.findOneBy({ clubId: clubB, id: sharedEventId });
    expect(stillThereB).not.toBeNull();
    expect(stillThereB?.payload).toMatchObject({ localTeam: 'Club B' });
  });

  it('les lectures par club ne remontent jamais les lignes de l’autre club', async () => {
    const db = await getDb();
    const repo = db.getRepository<MatchOfficialEntity>('MatchOfficial');

    const rowsA = await repo.findBy({ clubId: clubA });
    const rowsB = await repo.findBy({ clubId: clubB });
    expect(rowsA.every((row) => row.clubId === clubA)).toBe(true);
    expect(rowsB.every((row) => row.clubId === clubB)).toBe(true);
    // Le club B possède encore sa ligne partageant l'eventId commun.
    expect(rowsB.some((row) => row.id === sharedEventId)).toBe(true);
  });
});

describe.skipIf(!dbAvailable)('conversion de clé primaire tenant-scoped (integration)', () => {
  const scratchTable = `test_pk_conversion_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  async function dropScratch(db: DataSource): Promise<void> {
    await db.query(`DROP TABLE IF EXISTS \`${scratchTable}\``);
  }

  afterAll(async () => {
    const db = await getDb();
    await dropScratch(db);
  });

  it('convertit une table historique en PK composite sans perte de données, idempotente', async () => {
    const db = await getDb();
    await dropScratch(db);
    // Forme historique : PK globale sur la clé métier seule.
    await db.query(
      `CREATE TABLE \`${scratchTable}\` (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        clubId VARCHAR(255) NOT NULL,
        payload LONGTEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await db.query(`INSERT INTO \`${scratchTable}\` (id, clubId, payload) VALUES ('evt-1', 'club-a', '{"v":1}'), ('evt-2', 'club-b', '{"v":2}')`);

    const database = (db.options as { database?: string }).database as string;
    await convertTablePrimaryKeyToTenantScoped(db, database, scratchTable, 'id');

    const countRows = await db.query(`SELECT COUNT(*) AS n FROM \`${scratchTable}\``) as Array<{ n: number | bigint }>;
    expect(Number(countRows[0]?.n)).toBe(2);
    const rows = await db.query(`SELECT id, clubId, payload FROM \`${scratchTable}\` ORDER BY id`) as Array<{ id: string; clubId: string; payload: string }>;
    expect(rows[0]).toMatchObject({ id: 'evt-1', clubId: 'club-a' });
    expect(rows[1]).toMatchObject({ id: 'evt-2', clubId: 'club-b' });

    expect(await primaryKeyColumns(db, database, scratchTable)).toEqual(['clubId', 'id']);

    // Rejoue idempotente : aucun effet, aucune erreur.
    await expect(convertTablePrimaryKeyToTenantScoped(db, database, scratchTable, 'id')).resolves.toBeUndefined();
    // Après conversion, deux clubs peuvent partager la même clé métier.
    await db.query(`INSERT INTO \`${scratchTable}\` (id, clubId, payload) VALUES ('evt-1', 'club-b', '{"v":3}')`);
    const countAfter = await db.query(`SELECT COUNT(*) AS n FROM \`${scratchTable}\``) as Array<{ n: number | bigint }>;
    expect(Number(countAfter[0]?.n)).toBe(3);
  });

  it('refuse de convertir une clé primaire d’une forme inattendue', async () => {
    const db = await getDb();
    await dropScratch(db);
    await db.query(
      `CREATE TABLE \`${scratchTable}\` (
        surrogate INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        id VARCHAR(191) NOT NULL,
        clubId VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const database = (db.options as { database?: string }).database as string;
    await expect(convertTablePrimaryKeyToTenantScoped(db, database, scratchTable, 'id'))
      .rejects.toThrow(/clé primaire inattendue/);
  });

  it('ignore une table absente (base neuve)', async () => {
    const db = await getDb();
    const database = (db.options as { database?: string }).database as string;
    await expect(
      convertTablePrimaryKeyToTenantScoped(db, database, `table_inexistante_${Date.now()}`, 'id'),
    ).resolves.toBeUndefined();
  });
});
