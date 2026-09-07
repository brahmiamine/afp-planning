import type { DataSource, EntityManager } from 'typeorm';
import { notifyContact } from '@/lib/notifications/service';
import { readAppSettings } from '@/lib/settings-store';
import { eventStartTimestamp } from './p0-rules';
import {
  appendPublishedPlanningHistory,
  computePerUserPublicationChanges,
  getPublishedPlanning,
  removePublishedPlanningEvent,
} from './published-planning';
import { hydratePlanningAssignmentStates } from './assignment-state-overlay';

type Queryable = DataSource | EntityManager;

function schemaDataSource(db: Queryable): DataSource {
  return 'connection' in db ? db.connection : db;
}

function defaultClubId(): string {
  return process.env.APP_CLUB_ID?.trim() || 'afp';
}

export async function archivePlanningEvent(
  db: Queryable,
  eventType: string,
  eventId: string,
  archivedByUserId: number,
  clubId = defaultClubId(),
): Promise<void> {
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
  const effectiveRemoved = (await hydratePlanningAssignmentStates(db, [removed], clubId))[0] ?? removed;

  await appendPublishedPlanningHistory(db, { id: archivedByUserId, clubId }, [effectiveRemoved]);

  // Pas de notification pour un événement déjà passé : même règle que la sortie de la
  // fenêtre de publication (issue #76), un événement joué part en historique en silence.
  const { timeZone } = await readAppSettings(schemaDataSource(db), clubId);
  const start = eventStartTimestamp(effectiveRemoved.date, effectiveRemoved.time, timeZone);
  if (start !== null && start <= Date.now()) return;

  const changes = computePerUserPublicationChanges([effectiveRemoved], [], []);
  await Promise.all(changes.map((change) => notifyContact(schemaDataSource(db), change.contact, {
    type: `planning-published-${change.kind}`,
    title: 'Affectation supprimée',
    message: change.message,
    eventType: change.eventType,
    eventId: change.eventId,
  })));
}

/**
 * Vrai si l'événement fait partie du snapshot global actuellement publié.
 * On ne se fie pas au statut live : un événement publié peut déjà être "modified"
 * tout en restant visible aux utilisateurs jusqu'à la prochaine publication.
 */
export async function isPlanningEventCurrentlyPublished(
  db: Queryable,
  clubId: string,
  eventType: string,
  eventId: string,
): Promise<boolean> {
  const published = await getPublishedPlanning(db, clubId);
  return Boolean(published?.events.some(
    (event) => event.eventType === eventType && event.eventId === eventId,
  ));
}

export async function listArchivedPlanningEventKeys(db: Queryable, clubId = defaultClubId()): Promise<Set<string>> {
  const rows = await db.query(
    `SELECT event_type AS eventType, event_id AS eventId FROM planning_event_state
     WHERE club_id = ? AND archived_at IS NOT NULL`,
    [clubId],
  ) as Array<Record<string, unknown>>;
  return new Set(rows.map((row) => `${String(row.eventType)}:${String(row.eventId)}`));
}
