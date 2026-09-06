import type { DataSource, EntityManager } from 'typeorm';
import { notifyContact } from '@/lib/notifications/service';
import { readAppSettings } from '@/lib/settings-store';
import { eventStartTimestamp } from './p0-rules';
import {
  appendPublishedPlanningHistory,
  computePerUserPublicationChanges,
  removePublishedPlanningEvent,
} from './published-planning';

type Queryable = DataSource | EntityManager;

function schemaDataSource(db: Queryable): DataSource {
  return 'connection' in db ? db.connection : db;
}

let lifecycleReady = false;

function defaultClubId(): string {
  return process.env.APP_CLUB_ID?.trim() || 'afp';
}

async function ensureLifecycleTable(db: Queryable): Promise<void> {
  if (lifecycleReady) return;
  // Même règle que pour planning_records : ne jamais exécuter de DDL sur le
  // EntityManager d'une transaction applicative.
  const schemaDb = schemaDataSource(db);
  await schemaDb.query(`
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
  db: Queryable,
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

  // Issue #73 : l'archivage retire l'événement des snapshots live ; il doit aussi le
  // retirer du snapshot publié immédiatement, sinon il reste visible dans « Mon
  // planning », l'export iCal et les échanges d'affectation jusqu'à la prochaine
  // publication globale — une divergence de vue admin / utilisateurs.
  // L'événement retiré est versé dans l'historique publié, et les personnes affectées
  // sont notifiées (« Affectation supprimée »), comme lors d'une publication globale.
  const removed = await removePublishedPlanningEvent(db, clubId, eventType, eventId);
  if (!removed) return;

  await appendPublishedPlanningHistory(db, { id: archivedByUserId, clubId }, [removed]);

  // Pas de notification pour un événement déjà passé : même règle que la sortie de la
  // fenêtre de publication (issue #76), un événement joué part en historique en silence.
  const { timeZone } = await readAppSettings(db, clubId);
  const start = eventStartTimestamp(removed.date, removed.time, timeZone);
  if (start !== null && start <= Date.now()) return;

  const changes = computePerUserPublicationChanges([removed], [], []);
  await Promise.all(changes.map((change) => notifyContact(db, change.contact, {
    type: `planning-published-${change.kind}`,
    title: 'Affectation supprimée',
    message: change.message,
    eventType: change.eventType,
    eventId: change.eventId,
  })));
}

export async function listArchivedPlanningEventKeys(db: Queryable, clubId = defaultClubId()): Promise<Set<string>> {
  await ensureLifecycleTable(db);
  const rows = await db.query(
    `SELECT event_type AS eventType, event_id AS eventId FROM planning_event_state
     WHERE club_id = ? AND archived_at IS NOT NULL`,
    [clubId],
  ) as Array<Record<string, unknown>>;
  return new Set(rows.map((row) => `${String(row.eventType)}:${String(row.eventId)}`));
}
