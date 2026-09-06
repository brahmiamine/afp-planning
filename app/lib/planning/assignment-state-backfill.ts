import type { DataSource, EntityManager } from 'typeorm';
import { getCurrentClubIdOrNull } from '@/lib/auth/club-context';
import { getPlanningRecord, savePlanningRecord } from './records';
import { listPlanningEventSnapshots } from './event-store';
import { getPublishedPlanning, getPublishedPlanningHistory } from './published-planning';
import {
  backfillAssignmentStatesFromSnapshots,
  ensureAssignmentStateTable,
} from './assignment-state-store';

type Queryable = DataSource | EntityManager;

function defaultClubId(): string {
  return getCurrentClubIdOrNull() || process.env.APP_CLUB_ID?.trim() || 'afp';
}

function markerId(clubId: string): string {
  return `assignment-state-backfill:${clubId}`;
}

/**
 * Garantit que le rétro-remplissage initial du store d'état opérationnel (issue #41,
 * étape 1) a été exécuté pour le club, puis ne fait plus rien (marqueur en
 * `planning_records`). Doit être appelé dans le contexte club (ALS) : les snapshots
 * live sont listés via `getCurrentClubId`.
 *
 * Ordre des sources, par autorité décroissante : snapshots live (toutes les écritures
 * opérationnelles historiques y ont abouti), snapshot publié, historique publié. Le
 * backfill n'écrase jamais une ligne existante (INSERT IGNORE côté store), donc un
 * dual-write concurrent reste prioritaire. En cas d'échec en cours de route, le
 * marqueur n'est pas posé et l'exécution suivante reprend — l'opération est
 * idempotente.
 */
export async function ensureAssignmentStateBackfilled(db: Queryable, clubId = defaultClubId()): Promise<void> {
  await ensureAssignmentStateTable(db);
  const marker = await getPlanningRecord(db, markerId(clubId));
  if (marker) return;

  const live = await listPlanningEventSnapshots(db);
  const published = (await getPublishedPlanning(db, clubId))?.events ?? [];
  const history = (await getPublishedPlanningHistory(db, clubId))?.events ?? [];
  await backfillAssignmentStatesFromSnapshots(db, [...live, ...published, ...history], clubId);

  await savePlanningRecord(db, {
    id: markerId(clubId),
    kind: 'assignment-state-backfill',
    clubId,
    payload: { backfilledAt: new Date().toISOString() },
  });
}
