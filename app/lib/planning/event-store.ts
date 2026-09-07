import { In, type DataSource, type EntityManager } from 'typeorm';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from '@/lib/db/schemas';
import {
  parseEntrainementPayload,
  parseMatchExtrasPayload,
  parseMatchPayload,
  parsePlateauPayload,
  serializeEntrainementPayload,
  serializeMatchExtrasPayload,
  serializeMatchPayload,
  serializePlateauPayload,
} from '@/lib/db/planning-payload-codecs';
import type {
  AssignmentContact,
  Entrainement,
  Match,
  OfficialMatchAdminOverride,
  PlanningPublicationStatus,
  Plateau,
} from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { normalizePlanningStatus } from './p0-rules';
import { listArchivedPlanningEventKeys } from './event-lifecycle';
import { getCurrentClubId } from '@/lib/auth/club-context';
import {
  applyOfficialMatchAdminOverride,
  computeOfficialMatchAdminOverride,
  hasOfficialMatchAdminOverride,
  listOfficialMatchOverrideFields,
} from './official-match-overrides';

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
  sourceOverride?: {
    active: boolean;
    changedFields: string[];
    source: Match | null;
    updatedAt: string | null;
    updatedByUserId: number | null;
  };
}

export class PlanningConcurrencyError extends Error {
  constructor() {
    super('Le planning a été modifié par un autre utilisateur. Rechargez les données puis réessayez.');
    this.name = 'PlanningConcurrencyError';
  }
}

function planningRevision(payload: MatchExtras | Match | Entrainement | Plateau | undefined): number {
  const value = payload && 'planningRevision' in payload ? payload.planningRevision : undefined;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parsePlanningEventPayload(
  eventType: PlanningEventType,
  eventId: string,
  raw: unknown,
): Match | Entrainement | Plateau {
  if (eventType === 'officiel') {
    return parseMatchPayload(raw, 'MatchOfficial', { id: eventId, type: 'officiel' });
  }
  if (eventType === 'amical') {
    return parseMatchPayload(raw, 'MatchAmical', { id: eventId, type: 'amical' });
  }
  if (eventType === 'entrainement') return parseEntrainementPayload(raw, eventId);
  return parsePlateauPayload(raw, eventId);
}

function serializePlanningEventPayload(
  eventType: PlanningEventType,
  payload: Match | Entrainement | Plateau,
): Record<string, unknown> {
  if (eventType === 'officiel' || eventType === 'amical') {
    return serializeMatchPayload(payload as Match);
  }
  if (eventType === 'entrainement') {
    return serializeEntrainementPayload(payload as Entrainement);
  }
  return serializePlateauPayload(payload as Plateau);
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
    sourceOverride: eventType === 'officiel'
      ? {
          active: hasOfficialMatchAdminOverride(safeExtras.officialAdminOverride),
          changedFields: listOfficialMatchOverrideFields(safeExtras.officialAdminOverride),
          source: safeExtras.officialSourceSnapshot ?? null,
          updatedAt: safeExtras.officialOverrideUpdatedAt ?? safeExtras.officialOverrideDetectedAt ?? null,
          updatedByUserId: safeExtras.officialOverrideUpdatedByUserId ?? null,
        }
      : undefined,
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
    const current = row ? parseMatchExtrasPayload(row.payload, matchId) : { id: matchId };
    const actualRevision = planningRevision(current);
    assertExpectedRevision(actualRevision, expectedRevision);
    const next = { ...payload, id: matchId, planningRevision: actualRevision + 1 };
    await repo.save({ matchId, clubId, payload: serializeMatchExtrasPayload(next) });
    return next;
  });
}

export interface OfficialMatchOverrideActor {
  id: number;
  email: string;
}

export async function saveOfficialMatchAdminOverrideOptimistically(
  db: Queryable,
  matchId: string,
  updated: Match,
  expectedRevision: number,
  actor: OfficialMatchOverrideActor,
  options: { revertToSource?: boolean; markPublishedModified?: boolean; now?: string } = {},
): Promise<Match> {
  const clubId = getCurrentClubId();
  return withTransaction(db, async (manager) => {
    const officialRepo = manager.getRepository<MatchOfficialEntity>('MatchOfficial');
    const extraRepo = manager.getRepository<MatchExtraEntity>('MatchExtra');
    const row = await officialRepo.findOne({
      where: { id: matchId, clubId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) throw new Error('Événement introuvable');

    const extraRow = await extraRepo.findOne({
      where: { matchId, clubId },
      lock: { mode: 'pessimistic_write' },
    });
    const extras: MatchExtras = extraRow
      ? parseMatchExtrasPayload(extraRow.payload, matchId)
      : { id: matchId };
    const actualRevision = planningRevision(extras);
    assertExpectedRevision(actualRevision, expectedRevision);

    const current = parseMatchPayload(row.payload, 'MatchOfficial', { id: matchId, type: 'officiel' });
    const source = extras.officialSourceSnapshot
      ? parseMatchPayload(extras.officialSourceSnapshot, 'MatchOfficial', { id: matchId, type: 'officiel' })
      : current;
    const override: OfficialMatchAdminOverride = options.revertToSource
      ? {}
      : computeOfficialMatchAdminOverride(source, updated);
    const effective = applyOfficialMatchAdminOverride(source, override);
    const nextRevision = actualRevision + 1;
    const now = options.now ?? new Date().toISOString();
    const hasOverride = hasOfficialMatchAdminOverride(override);
    const nextMatch: Match = {
      ...effective,
      id: matchId,
      planningRevision: nextRevision,
    };
    const nextExtras: MatchExtras = {
      ...extras,
      id: matchId,
      planningRevision: nextRevision,
      officialSourceSnapshot: source,
      officialAdminOverride: hasOverride ? override : null,
      officialOverrideUpdatedAt: now,
      officialOverrideUpdatedByUserId: actor.id,
      officialOverrideUpdatedByUserEmail: actor.email,
      ...(options.markPublishedModified
        ? { planningStatus: 'modified' as const, modifiedAfterPublishAt: now }
        : {}),
    };

    await officialRepo.save({
      ...row,
      date: nextMatch.date,
      time: nextMatch.time || '',
      payload: serializeMatchPayload(nextMatch),
    });
    await extraRepo.save({
      matchId,
      clubId,
      payload: serializeMatchExtrasPayload(nextExtras),
    });
    return nextMatch;
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
    const current = parsePlanningEventPayload(eventType, eventId, row.payload);
    const actualRevision = planningRevision(current);
    assertExpectedRevision(actualRevision, expectedRevision);
    const next = { ...payload, planningRevision: actualRevision + 1 } as T;
    await repo.save({
      ...row,
      date: next.date,
      time: next.time || '',
      payload: serializePlanningEventPayload(eventType, next),
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
    extras.set(row.matchId, parseMatchExtrasPayload(row.payload, row.matchId));
  }

  const snapshots: PlanningEventSnapshot[] = [];
  for (const row of officialRows) {
    const match = parseMatchPayload(row.payload, 'MatchOfficial', { id: row.id, type: 'officiel' });
    const snapshot = matchSnapshot(match, 'officiel', extras.get(row.id));
    if (snapshot && !archived.has(`officiel:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  for (const row of friendlyRows) {
    const match = parseMatchPayload(row.payload, 'MatchAmical', { id: row.id, type: 'amical' });
    const snapshot = matchSnapshot(match, 'amical', extras.get(row.id));
    if (snapshot && !archived.has(`amical:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  for (const row of trainingRows) {
    const snapshot = simpleSnapshot(parseEntrainementPayload(row.payload, row.id));
    if (!archived.has(`entrainement:${snapshot.eventId}`)) snapshots.push(snapshot);
  }
  for (const row of plateauRows) {
    const snapshot = simpleSnapshot(parsePlateauPayload(row.payload, row.id));
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
    extras.set(row.matchId, parseMatchExtrasPayload(row.payload, row.matchId));
  }

  const snapshots: PlanningEventSnapshot[] = [];
  for (const row of officialRows) {
    const match = parseMatchPayload(row.payload, 'MatchOfficial', { id: row.id, type: 'officiel' });
    const snapshot = matchSnapshot(match, 'officiel', extras.get(row.id));
    if (snapshot) snapshots.push(snapshot);
  }
  for (const row of friendlyRows) {
    const match = parseMatchPayload(row.payload, 'MatchAmical', { id: row.id, type: 'amical' });
    const snapshot = matchSnapshot(match, 'amical', extras.get(row.id));
    if (snapshot) snapshots.push(snapshot);
  }
  for (const row of trainingRows) {
    snapshots.push(simpleSnapshot(parseEntrainementPayload(row.payload, row.id)));
  }
  for (const row of plateauRows) {
    snapshots.push(simpleSnapshot(parsePlateauPayload(row.payload, row.id)));
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
    const match = parseMatchPayload(
      row.payload,
      eventType === 'officiel' ? 'MatchOfficial' : 'MatchAmical',
      { id: eventId, type: eventType },
    );
    const extraRow = await db.getRepository<MatchExtraEntity>('MatchExtra').findOneBy({ matchId: eventId, clubId });
    const extras = extraRow ? parseMatchExtrasPayload(extraRow.payload, eventId) : undefined;
    return matchSnapshot(match, eventType, extras);
  }

  if (eventType === 'entrainement') {
    const row = await db.getRepository<EntrainementEntity>('Entrainement').findOneBy({ id: eventId, clubId });
    return row ? simpleSnapshot(parseEntrainementPayload(row.payload, eventId)) : null;
  }

  const row = await db.getRepository<PlateauEntity>('Plateau').findOneBy({ id: eventId, clubId });
  return row ? simpleSnapshot(parsePlateauPayload(row.payload, eventId)) : null;
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
      const extras: MatchExtras = row
        ? parseMatchExtrasPayload(row.payload, snapshot.eventId)
        : { id: snapshot.eventId };
      const actualRevision = planningRevision(extras);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      if (role === 'arbitre') extras.arbitreTouche = contacts;
      if (role === 'encadrant') extras.contactEncadrants = contacts;
      if (role === 'accompagnateur') extras.contactAccompagnateur = contacts;
      extras.planningRevision = actualRevision + 1;
      await repo.save({ matchId: snapshot.eventId, clubId, payload: serializeMatchExtrasPayload(extras) });
      return actualRevision + 1;
    });
  }

  if (role !== 'encadrant') throw new Error('Ce rôle n’est pas disponible pour cet événement');
  if (snapshot.eventType === 'entrainement') {
    return withTransaction(db, async (manager) => {
      const repo = manager.getRepository<EntrainementEntity>('Entrainement');
      const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new Error('Événement introuvable');
      const event = parseEntrainementPayload(row.payload, snapshot.eventId);
      const actualRevision = planningRevision(event);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      const next: Entrainement = { ...event, encadrants: contacts, planningRevision: actualRevision + 1 };
      row.payload = serializeEntrainementPayload(next);
      await repo.save(row);
      return actualRevision + 1;
    });
  }

  return withTransaction(db, async (manager) => {
    const repo = manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const event = parsePlateauPayload(row.payload, snapshot.eventId);
    const actualRevision = planningRevision(event);
    assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
    const next: Plateau = { ...event, encadrants: contacts, planningRevision: actualRevision + 1 };
    row.payload = serializePlateauPayload(next);
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
      const extras = row
        ? parseMatchExtrasPayload(row.payload, snapshot.eventId)
        : { id: snapshot.eventId };
      const actualRevision = planningRevision(extras);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      const next = { ...extras, ...patch, planningRevision: actualRevision + 1 } as MatchExtras;
      await repo.save({ matchId: snapshot.eventId, clubId, payload: serializeMatchExtrasPayload(next) });
    });
    return;
  }

  if (snapshot.eventType === 'entrainement') {
    await withTransaction(db, async (manager) => {
      const repo = manager.getRepository<EntrainementEntity>('Entrainement');
      const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new Error('Événement introuvable');
      const event = parseEntrainementPayload(row.payload, snapshot.eventId);
      const actualRevision = planningRevision(event);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      const next = { ...event, ...patch, planningRevision: actualRevision + 1 } as Entrainement;
      row.payload = serializeEntrainementPayload(next);
      await repo.save(row);
    });
    return;
  }

  await withTransaction(db, async (manager) => {
    const repo = manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: snapshot.eventId, clubId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const event = parsePlateauPayload(row.payload, snapshot.eventId);
    const actualRevision = planningRevision(event);
    assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
    const next = { ...event, ...patch, planningRevision: actualRevision + 1 } as Plateau;
    row.payload = serializePlateauPayload(next);
    await repo.save(row);
  });
}
