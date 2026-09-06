import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

export interface ScraperRunSummary {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: Date;
  finishedAt: Date | null;
  activeCount: number | null;
  createdCount: number | null;
  updatedCount: number | null;
  missingCount: number | null;
  errorMessage: string | null;
}

export async function startScraperRun(db: DataSource, clubId: string): Promise<string> {
  const id = randomUUID();
  await db.query('INSERT INTO scraper_sync_runs (id, club_id, status) VALUES (?, ?, ?)', [id, clubId, 'running']);
  return id;
}

export async function finishScraperRun(
  db: DataSource,
  id: string,
  result: { activeCount: number; createdCount: number; updatedCount: number; missingCount: number },
): Promise<void> {
  await db.query(
    `UPDATE scraper_sync_runs SET status = 'succeeded', finished_at = CURRENT_TIMESTAMP(6),
       active_count = ?, created_count = ?, updated_count = ?, missing_count = ?, error_message = NULL
     WHERE id = ?`,
    [result.activeCount, result.createdCount, result.updatedCount, result.missingCount, id],
  );
}

export async function failScraperRun(db: DataSource, id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Erreur inconnue';
  await db.query(
    `UPDATE scraper_sync_runs SET status = 'failed', finished_at = CURRENT_TIMESTAMP(6), error_message = ? WHERE id = ?`,
    [message.slice(0, 4000), id],
  );
}

export async function listScraperRuns(db: DataSource, clubId: string, limit = 25): Promise<ScraperRunSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = await db.query(
    `SELECT id, status, started_at AS startedAt, finished_at AS finishedAt,
       active_count AS activeCount, created_count AS createdCount, updated_count AS updatedCount,
       missing_count AS missingCount, error_message AS errorMessage
     FROM scraper_sync_runs WHERE club_id = ? ORDER BY started_at DESC LIMIT ${safeLimit}`,
    [clubId],
  ) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    status: row.status as ScraperRunSummary['status'],
    startedAt: new Date(String(row.startedAt)),
    finishedAt: row.finishedAt ? new Date(String(row.finishedAt)) : null,
    activeCount: row.activeCount === null ? null : Number(row.activeCount),
    createdCount: row.createdCount === null ? null : Number(row.createdCount),
    updatedCount: row.updatedCount === null ? null : Number(row.updatedCount),
    missingCount: row.missingCount === null ? null : Number(row.missingCount),
    errorMessage: row.errorMessage === null ? null : String(row.errorMessage),
  }));
}
