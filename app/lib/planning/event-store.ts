import { In, type DataSource, type EntityManager } from 'typeorm';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from '@/lib/db/schemas';
import type {
  AssignmentContact,
  Entrainement,
  Match,
  PlanningPublicationStatus,
  Plateau,
} from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { normalizePlanningStatus } from './p0-rules';
import { listArchivedPlanningEventKeys } from './event-lifecycle';
import { getCurrentClubId } from '@/lib/auth/club-context';

type Queryable = DataSource | EntityManager;

function isEntityManager(db: Queryable): db is EntityManager {
  return 'queryRunner' in db && 'connection' in db;
}

async function withTransaction<T>(
  db: Queryable,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  // Quand l'appelant fournit déjà le manager de la transaction globale, on réutilise
  // exactement cette transaction au lieu de créer des SAVEPOINTs inutiles.
  return isEntityManager(db) ? work(db) : db.transaction(work);
}

export type PlanningEventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
export type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

export interface PlanningEventSnapshot {
  eventId: string;
  eventType: PlanningEventType;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location: string | null;
  planningStatus: PlanningPublicationStatus;
  event: Match | Entrainement | Plateau;
  extras: MatchExtras | null;
  assignments: Record<PlanningRole, AssignmentContact[]>;
  revision?: number;
}

export class PlanningConcurrencyError extends Error {
  constructor() {
    super('Le planning a été modifié par un autre utilisateur. Rechargez les données puis réessayez.');
    this.name = 'PlanningConcurrencyError';
  }
}

function planningRevision(payload: Record<string, unknown> | MatchExtras | Match | Entrainement | Plateau | undefined): number {
  const value = payload && 'planningRevision' in payload ? payload.planningRevision : undefined;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function matchTitle(match: Match): string {
  return `${match.localTeam} – ${match.awayTeam}`;
}

function simpleTitle(event: Entrainement | Plateau): string {
  if (event.type === 'entrainement') {
    return event.categorie ? `Entraînement ${event.categorie}` : 'Entraînement';
  }
  return event.categories?.length ? `Plateau ${event.categories.join(', ')}` : 'Plateau';
}

function matchSnapshot(
  match: Match,
  eventType: 'officiel' | 'amical',
  extras: MatchExtras | undefined,
): PlanningEventSnapshot | null {
  if (!match.id) return null;
  const safeExtras: MatchExtras = extras ?? { id: match.id };
  return {
    eventId: match.id,
    eventType,
    title: matchTitle(match),
    date: match.date,
    time: match.time,
    durationMinutes: match.durationMinutes ?? 90,
    location: match.details?.stadium ?? null,
    planningStatus: normalizePlanningStatus(safeExtras.planningStatus),
    event: match,
    extras: safeExtras,
    assignments: {
      arbitre: safeExtras.arbitreTouche ?? [],
      encadrant: safeExtras.contactEncadrants ?? [],
      accompagnateur: safeExtras.contactAccompagnateur ?? [],
    },
    revision: planningRevision(safeExtras),
  };
}

function simpleSnapshot(event: Entrainement | Plateau): PlanningEventSnapshot {
  return {
    eventId: event.id,
    eventType: event.type,
    title: simpleTitle(event),
    date: event.date,
    time: event.time,
    durationMinutes: event.durationMinutes ?? (event.type === 'plateau' ? 120 : 90),
    location: event.lieu || null,
    planningStatus: normalizePlanningStatus(event.planningStatus),
    event,
    extras: null,
    assignments: {
      arbitre: [],
      encadrant: event.encadrants ?? [],
      accompagnateur: [],
    },
    revision: planningRevision(event),
  };
}

function assertExpectedRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new PlanningConcurrencyError();
}

export async function saveMatchExtrasOptimistically(
  db: Queryable,
  matchId: string,
  payload: MatchExtras,
  expectedRevision: number,
): Promise<MatchExtras> {
  const clubId = getCurrentClubId();
  return db.transaction(async (manager) => {
    const repo = manager.getRepository<MatchExtraEntity>('MatchExtra');
    const row = await repo.findOne({ where: { matchId, clubId }, lock: { mode: 'pessimistic_write' } });
    const actualRevision = planningRevision(row?.payload);
    assertExpectedRevision(actualRevision, expectedRevision);
    const next = { ...payload, planningRevision: actualRevision + 1 };
    await repo.save({ matchId, clubId, payload: next as unknown as Record<string, unknown> });
    return next;
  });
}

export async function saveBasePlanningEventOptimistically<T extends Match | Entrainement | Plateau>(
  db: Queryable,
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau',
  eventId: string,
  payload: T,
  expectedRevision: number,
): Promise<T> {
  const clubId = getCurrentClubId();
  return db.transaction(async (manager) => {
    const repo = eventType === 'officiel'
      ? manager.getRepository<MatchOfficialEntity>('MatchOfficial')
      : eventType === 'amical'
        ? manager.getRepository<MatchAmicalEntity>('MatchAmical')
        : eventType === 'entrainement'
          ? manager.getRepository<EntrainementEntity>('Entrainement')
          : manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: eventId, clubId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const actualRevision = planningRevision(row.payload);
    assertExpectedRevision(actualRevision, expectedRevision);
    const next = { ...payload, planningRevision: actualRevision + 1 } as T;
    await repo.save({
      ...row,
      date: next.date,
      time: next.time || '',
      payload: next as unknown as Record<string, unknown>,
    });
    return next;
  });
}

export async function listPlanningEventSnapshots(db: Queryable): Promise<PlanningEventSnapshot[]> {
  const clubId = getCurrentClubId();
  const [officialRows, friendlyRows, trainingRows, plateauRows, extraRows, archived] = await Promise.all([
    db.getRepository<MatchOfficialEntity>('MatchOfficial').findBy({ clubId }),
    db.getRepository<MatchAmicalEntity>('MatchAmical').findBy({ clubId }),
    db.getRepository<EntrainementEntity>('Entrainement').findBy({ clubId }),
    db.getRepository<PlateauEntity>('Plateau').findBy({ clubId }),
    db.getRepository<MatchExtraEntity>('MatchExtra').findBy({ clubId }),
    listArchivedPlanningEventKeys(db, clubId),
  ]);

  const extras = new Map<string, MatchExtras>();
  for (const row of extraRows) {
    extras.set(row.matchId, row.payload as unknown as MatchExtras);
  }

  const snapshots: PlanningEventSnapshot[] = [];
  for (const row of officialRows) {
    const match = row.payload as unknown as Match;
    const snapshot = matchSnapshot(match, 'officiel', match.id ? extras.get(match.id) : undefined);
    if (snapshot && !archived.has(`officiel:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  for (const row of friendlyRows) {
    const match = row.payload as unknown as Match;
    const snapshot = matchSnapshot(match, 'amical', match.id ? extras.get(match.id) : undefined);
    if (snapshot && !archived.has(`amical:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  for (const row of trainingRows) {
    const snapshot = simpleSnapshot(row.payload as unknown as Entrainement);
    if (!archived.has(`entrainement:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  for (const row of plateauRows) {
    const snapshot = simpleSnapshot(row.payload as unknown as Plateau);
    if (!archived.has(`plateau:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  return snapshots;
}

/**
 * Variante ciblée de `listPlanningEventSnapshots` : ne lit que les événements live désignés
 * par `keys`, via des requêtes `id IN (...)` par table plutôt qu'un scan complet des quatre
 * tables du club. Utilisée pour superposer l'état opérationnel live sur un sous-ensemble déjà
 * connu d'événements (ex. le snapshot publié), sans payer le coût d'un scan complet à chaque
 * requête (ex. export iCal, rafraîchi automatiquement par les clients).
 */
export async function listPlanningEventSnapshotsByKeys(
  db: Queryable,
  keys: { eventType: PlanningEventType; eventId: string }[],
): Promise<PlanningEventSnapshot[]> {
  if (keys.length === 0) return [];
  const clubId = getCurrentClubId();
  const idsByType: Record<PlanningEventType, string[]> = { officiel: [], amical: [], entrainement: [], plateau: [] };
  for (const key of keys) idsByType[key.eventType].push(key.eventId);
  const matchIds = [...idsByType.officiel, ...idsByType.amical];

  const [officialRows, friendlyRows, trainingRows, plateauRows, extraRows] = await Promise.all([
    idsByType.officiel.length
      ? db.getRepository<MatchOfficialEntity>('MatchOfficial').findBy({ clubId, id: In(idsByType.officiel) })
      : Promise.resolve([]),
    idsByType.amical.length
      ? db.getRepository<MatchAmicalEntity>('MatchAmical').findBy({ clubId, id: In(idsByType.amical) })
      : Promise.resolve([]),
    idsByType.entrainement.length
      ? db.getRepository<EntrainementEntity>('Entrainement').findBy({ clubId, id: In(idsByType.entrainement) })
      : Promise.resolve([]),
    idsByType.plateau.length
      ? db.getRepository<PlateauEntity>('Plateau').findBy({ clubId, id: In(idsByType.plateau) })
      : Promise.resolve([]),
    matchIds.length
      ? db.getRepository<MatchExtraEntity>('MatchExtra').findBy({ clubId, matchId: In(matchIds) })
      : Promise.resolve([]),
  ]);

  const extras = new Map<string, MatchExtras>();
  for (const row of extraRows) {
    extras.set(row.matchId, row.payload as unknown as MatchExtras);
  }

  const snapshots: PlanningEventSnapshot[] = [];
  for (const row of officialRows) {
    const match = row.payload as unknown as Match;
    const snapshot = matchSnapshot(match, 'officiel', match.id ? extras.get(match.id) : undefined);
    if (snapshot) snapshots.push(snapshot);
  }
  for (const row of friendlyRows) {
    const match = row.payload as unknown as Match;
    const snapshot = matchSnapshot(match, 'amical', match.id ? extras.get(match.id) : undefined);
    if (snapshot) snapshots.push(snapshot);
  }
  for (const row of trainingRows) {
    snapshots.push(simpleSnapshot(row.payload as unknown as Entrainement));
  }
  for (const row of plateauRows) {
    snapshots.push(simpleSnapshot(row.payload as unknown as Plateau));
  }
  return snapshots;
}

export async function getPlanningEventSnapshot(
  db: Queryable,
  eventType: PlanningEventType,
  eventId: string,
): Promise<PlanningEventSnapshot | null> {
  const clubId = getCurrentClubId();
  if (eventType === 'officiel' || eventType === 'amical') {
    const eventRepo = eventType === 'officiel'
      ? db.getRepository<MatchOfficialEntity>('MatchOfficial')
      : db.getRepository<MatchAmicalEntity>('MatchAmical');
    const row = await eventRepo.findOneBy({ id: eventId, clubId });
    if (!row) return null;
    const match = row.payload as unknown as Match;
    const extraRow = await db.getRepository<MatchExtraEntity>('MatchExtra').findOneBy({ matchId: eventId, clubId });
    return matchSnapshot(match, eventType, extraRow?.payload as unknown as MatchExtras | undefined);
  }

  if (eventType === 'entrainement') {
    const row = await db.getRepository<EntrainementEntity>('Entrainement').findOneBy({ id: eventId, clubId });
    return row ? simpleSnapshot(row.payload as unknown as Entrainement) : null;
  }

  const row = await db.getRepository<PlateauEntity>('Plateau').findOneBy({ id: eventId, clubId });
  return row ? simpleSnapshot(row.payload as unknown as Plateau) : null;
}

export async function saveRoleAssignments(
  db: Queryable,
  snapshot: PlanningEventSnapshot,
  role: PlanningRole,
  contacts: AssignmentContact[],
): Promise<number> {
  const clubId = getCurrentClubId();
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    return withTransaction(db, async (manager) => {
      const repo = manager.getRepository<MatchExtraEntity>('MatchExtra');
      const row = await repo.findOne({ where: { matchId: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
      const extras: MatchExtras = row ? (row.payload as unknown as MatchExtras) : { id: snapshot.eventId };
      const actualRevision = planningRevision(extras);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      if (role === 'arbitre') extras.arbitreTouche = contacts;
      if (role === 'encadrant') extras.contactEncadrants = contacts;
      if (role === 'accompagnateur') extras.contactAccompagnateur = contacts;
      extras.planningRevision = actualRevision + 1;
      await repo.save({ matchId: snapshot.eventId, clubId, payload: extras as unknown as Record<string, unknown> });
      return actualRevision + 1;
    });
  }

  if (role !== 'encadrant') throw new Error('Ce rôle n’est pas disponible pour cet événement');
  if (snapshot.eventType === 'entrainement') {
    return withTransaction(db, async (manager) => {
      const repo = manager.getRepository<EntrainementEntity>('Entrainement');
      const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new Error('Événement introuvable');
      const actualRevision = planningRevision(row.payload);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      row.payload = { ...(row.payload as Record<string, unknown>), encadrants: contacts, planningRevision: actualRevision + 1 };
      await repo.save(row);
      return actualRevision + 1;
    });
  }

  return withTransaction(db, async (manager) => {
    const repo = manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const actualRevision = planningRevision(row.payload);
    assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
    row.payload = { ...(row.payload as Record<string, unknown>), encadrants: contacts, planningRevision: actualRevision + 1 };
    await repo.save(row);
    return actualRevision + 1;
  });
}

export async function savePlanningPublication(
  db: Queryable,
  snapshot: PlanningEventSnapshot,
  patch: Record<string, unknown>,
): Promise<void> {
  const clubId = getCurrentClubId();
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    await withTransaction(db, async (manager) => {
      const repo = manager.getRepository<MatchExtraEntity>('MatchExtra');
      const row = await repo.findOne({ where: { matchId: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
      const extras = row ? (row.payload as Record<string, unknown>) : { id: snapshot.eventId };
      const actualRevision = planningRevision(extras);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      await repo.save({ matchId: snapshot.eventId, clubId, payload: { ...extras, ...patch, planningRevision: actualRevision + 1 } });
    });
    return;
  }

  if (snapshot.eventType === 'entrainement') {
    await withTransaction(db, async (manager) => {
      const repo = manager.getRepository<EntrainementEntity>('Entrainement');
      const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new Error('Événement introuvable');
      const actualRevision = planningRevision(row.payload);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      row.payload = { ...(row.payload as Record<string, unknown>), ...patch, planningRevision: actualRevision + 1 };
      await repo.save(row);
    });
    return;
  }

  await withTransaction(db, async (manager) => {
    const repo = manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const actualRevision = planningRevision(row.payload);
    assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
    row.payload = { ...(row.payload as Record<string, unknown>), ...patch, planningRevision: actualRevision + 1 };
    await repo.save(row);
  });
}
