import type { DataSource } from 'typeorm';

let lifecycleReady = false;

function defaultClubId(): string {
  return process.env.APP_CLUB_ID?.trim() || 'afp';
}

async function ensureLifecycleTable(db: DataSource): Promise<void> {
  if (lifecycleReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS planning_event_state (
      club_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      event_id VARCHAR(191) NOT NULL,
      archived_at DATETIME(6) NULL,
      archived_by_user_id INT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (club_id, event_type, event_id),
      INDEX idx_planning_event_state_archived (club_id, archived_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  lifecycleReady = true;
}

export async function archivePlanningEvent(
  db: DataSource,
  eventType: string,
  eventId: string,
  archivedByUserId: number,
  clubId = defaultClubId(),
): Promise<void> {
  await ensureLifecycleTable(db);
  await db.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO planning_event_state (club_id, event_type, event_id, archived_at, archived_by_user_id)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP(6), ?)
       ON DUPLICATE KEY UPDATE archived_at = CURRENT_TIMESTAMP(6), archived_by_user_id = VALUES(archived_by_user_id)`,
      [clubId, eventType, eventId, archivedByUserId],
    );
    await manager.query(
      `UPDATE chat_rooms SET archivedAt = CURRENT_TIMESTAMP(6)
       WHERE clubId = ? AND eventType = ? AND eventId = ? AND archivedAt IS NULL`,
      [clubId, eventType, eventId],
    );
  });
}

export async function listArchivedPlanningEventKeys(db: DataSource, clubId = defaultClubId()): Promise<Set<string>> {
  await ensureLifecycleTable(db);
  const rows = await db.query(
    `SELECT event_type AS eventType, event_id AS eventId FROM planning_event_state
     WHERE club_id = ? AND archived_at IS NOT NULL`,
    [clubId],
  ) as Array<Record<string, unknown>>;
  return new Set(rows.map((row) => `${String(row.eventType)}:${String(row.eventId)}`));
}
