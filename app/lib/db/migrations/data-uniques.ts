import type { DataSource } from 'typeorm';

/**
 * Migration 0021 (issue #386) : contraintes UNIQUE métier.
 *
 * - `(clubId, sourceMatchId)` sur les matchs officiels scrapés (NULL autorisé pour les manuels).
 * - Une seule invitation pending par `(clubId, email normalisé)` via `pendingEmailKey`.
 */

export interface DataUniquesReport {
  dedupedOfficialMatches: number;
  dedupedPendingInvitations: number;
}

async function tableExists(db: DataSource, table: string): Promise<boolean> {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  ) as Array<{ n?: number | string }>;
  return Number(rows[0]?.n) > 0;
}

async function indexExists(db: DataSource, table: string, indexName: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  ) as Array<{ n?: number | string }>;
  return Number(rows[0]?.n) > 0;
}

export async function dedupeOfficialSourceMatchIds(db: DataSource): Promise<number> {
  if (!(await tableExists(db, 'matches_officiels'))) return 0;

  const duplicates = await db.query(
    `SELECT clubId, sourceMatchId, GROUP_CONCAT(id ORDER BY updatedAt DESC) AS ids, COUNT(*) AS n
     FROM matches_officiels
     WHERE sourceMatchId IS NOT NULL AND sourceMatchId <> ''
     GROUP BY clubId, sourceMatchId
     HAVING n > 1`,
  ) as Array<{ clubId: string; sourceMatchId: string; ids: string }>;

  let removed = 0;
  for (const row of duplicates) {
    const [, ...toRemove] = row.ids.split(',');
    for (const id of toRemove) {
      await db.query('DELETE FROM matches_officiels WHERE clubId = ? AND id = ?', [row.clubId, id]);
      removed += 1;
    }
  }
  return removed;
}

export async function backfillOfficialSourceMatchIds(db: DataSource): Promise<void> {
  if (!(await tableExists(db, 'matches_officiels'))) return;
  await db.query(
    `UPDATE matches_officiels
     SET sourceMatchId = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sourceMatchId')), '')
     WHERE sourceMatchId IS NULL`,
  );
}

export async function dedupePendingInvitations(db: DataSource): Promise<number> {
  if (!(await tableExists(db, 'invitations'))) return 0;

  await db.query(
    `UPDATE invitations
     SET pendingEmailKey = CONCAT(clubId, ':', LOWER(email))
     WHERE usedAt IS NULL AND expiresAt > NOW(6) AND email IS NOT NULL AND pendingEmailKey IS NULL`,
  );

  const duplicates = await db.query(
    `SELECT pendingEmailKey, GROUP_CONCAT(id ORDER BY createdAt DESC) AS ids, COUNT(*) AS n
     FROM invitations
     WHERE pendingEmailKey IS NOT NULL
     GROUP BY pendingEmailKey
     HAVING n > 1`,
  ) as Array<{ pendingEmailKey: string; ids: string }>;

  let removed = 0;
  for (const row of duplicates) {
    const [, ...toRemove] = row.ids.split(',');
    for (const id of toRemove) {
      await db.query('DELETE FROM invitations WHERE id = ?', [id]);
      removed += 1;
    }
  }
  return removed;
}

export async function addDataUniqueIndexes(db: DataSource): Promise<void> {
  if (await tableExists(db, 'matches_officiels') && !(await indexExists(db, 'matches_officiels', 'uq_matches_officiels_club_source'))) {
    await db.query(
      'CREATE UNIQUE INDEX uq_matches_officiels_club_source ON matches_officiels (clubId, sourceMatchId)',
    );
  }

  if (await tableExists(db, 'invitations') && !(await indexExists(db, 'invitations', 'uq_invitations_pending_email'))) {
    await db.query(
      'CREATE UNIQUE INDEX uq_invitations_pending_email ON invitations (pendingEmailKey)',
    );
  }
}

export async function enforceDataUniques(db: DataSource): Promise<DataUniquesReport> {
  await backfillOfficialSourceMatchIds(db);
  const dedupedOfficialMatches = await dedupeOfficialSourceMatchIds(db);
  const dedupedPendingInvitations = await dedupePendingInvitations(db);
  await addDataUniqueIndexes(db);
  return { dedupedOfficialMatches, dedupedPendingInvitations };
}
