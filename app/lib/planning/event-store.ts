import type { DataSource } from 'typeorm';
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
  db: DataSource,
  matchId: string,
  payload: MatchExtras,
  expectedRevision: number,
): Promise<MatchExtras> {
  return db.transaction(async (manager) => {
    const repo = manager.getRepository<MatchExtraEntity>('MatchExtra');
    const row = await repo.findOne({ where: { matchId }, lock: { mode: 'pessimistic_write' } });
    const actualRevision = planningRevision(row?.payload);
    assertExpectedRevision(actualRevision, expectedRevision);
    const next = { ...payload, planningRevision: actualRevision + 1 };
    await repo.save({ matchId, payload: next as unknown as Record<string, unknown> });
    return next;
  });
}

export async function saveBasePlanningEventOptimistically<T extends Match | Entrainement | Plateau>(
  db: DataSource,
  eventType: 'amical' | 'entrainement' | 'plateau',
  eventId: string,
  payload: T,
  expectedRevision: number,
): Promise<T> {
  return db.transaction(async (manager) => {
    const repo = eventType === 'amical'
      ? manager.getRepository<MatchAmicalEntity>('MatchAmical')
      : eventType === 'entrainement'
        ? manager.getRepository<EntrainementEntity>('Entrainement')
        : manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: eventId }, lock: { mode: 'pessimistic_write' } });
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

export async function listPlanningEventSnapshots(db: DataSource): Promise<PlanningEventSnapshot[]> {
  const [officialRows, friendlyRows, trainingRows, plateauRows, extraRows, archived] = await Promise.all([
    db.getRepository<MatchOfficialEntity>('MatchOfficial').find(),
    db.getRepository<MatchAmicalEntity>('MatchAmical').find(),
    db.getRepository<EntrainementEntity>('Entrainement').find(),
    db.getRepository<PlateauEntity>('Plateau').find(),
    db.getRepository<MatchExtraEntity>('MatchExtra').find(),
    listArchivedPlanningEventKeys(db),
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

export async function getPlanningEventSnapshot(
  db: DataSource,
  eventType: PlanningEventType,
  eventId: string,
): Promise<PlanningEventSnapshot | null> {
  if (eventType === 'officiel' || eventType === 'amical') {
    const eventRepo = eventType === 'officiel'
      ? db.getRepository<MatchOfficialEntity>('MatchOfficial')
      : db.getRepository<MatchAmicalEntity>('MatchAmical');
    const row = await eventRepo.findOneBy({ id: eventId });
    if (!row) return null;
    const match = row.payload as unknown as Match;
    const extraRow = await db.getRepository<MatchExtraEntity>('MatchExtra').findOneBy({ matchId: eventId });
    return matchSnapshot(match, eventType, extraRow?.payload as unknown as MatchExtras | undefined);
  }

  if (eventType === 'entrainement') {
    const row = await db.getRepository<EntrainementEntity>('Entrainement').findOneBy({ id: eventId });
    return row ? simpleSnapshot(row.payload as unknown as Entrainement) : null;
  }

  const row = await db.getRepository<PlateauEntity>('Plateau').findOneBy({ id: eventId });
  return row ? simpleSnapshot(row.payload as unknown as Plateau) : null;
}

export async function saveRoleAssignments(
  db: DataSource,
  snapshot: PlanningEventSnapshot,
  role: PlanningRole,
  contacts: AssignmentContact[],
): Promise<number> {
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    return db.transaction(async (manager) => {
      const repo = manager.getRepository<MatchExtraEntity>('MatchExtra');
      const row = await repo.findOne({ where: { matchId: snapshot.eventId }, lock: { mode: 'pessimistic_write' } });
      const extras: MatchExtras = row ? (row.payload as unknown as MatchExtras) : { id: snapshot.eventId };
      const actualRevision = planningRevision(extras);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      if (role === 'arbitre') extras.arbitreTouche = contacts;
      if (role === 'encadrant') extras.contactEncadrants = contacts;
      if (role === 'accompagnateur') extras.contactAccompagnateur = contacts;
      extras.planningRevision = actualRevision + 1;
      await repo.save({ matchId: snapshot.eventId, payload: extras as unknown as Record<string, unknown> });
      return actualRevision + 1;
    });
  }

  if (role !== 'encadrant') throw new Error('Ce rôle n’est pas disponible pour cet événement');
  if (snapshot.eventType === 'entrainement') {
    return db.transaction(async (manager) => {
      const repo = manager.getRepository<EntrainementEntity>('Entrainement');
      const row = await repo.findOne({ where: { id: snapshot.eventId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new Error('Événement introuvable');
      const actualRevision = planningRevision(row.payload);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      row.payload = { ...(row.payload as Record<string, unknown>), encadrants: contacts, planningRevision: actualRevision + 1 };
      await repo.save(row);
      return actualRevision + 1;
    });
  }

  return db.transaction(async (manager) => {
    const repo = manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: snapshot.eventId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const actualRevision = planningRevision(row.payload);
    assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
    row.payload = { ...(row.payload as Record<string, unknown>), encadrants: contacts, planningRevision: actualRevision + 1 };
    await repo.save(row);
    return actualRevision + 1;
  });
}

export async function savePlanningPublication(
  db: DataSource,
  snapshot: PlanningEventSnapshot,
  patch: Record<string, unknown>,
): Promise<void> {
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    await db.transaction(async (manager) => {
      const repo = manager.getRepository<MatchExtraEntity>('MatchExtra');
      const row = await repo.findOne({ where: { matchId: snapshot.eventId }, lock: { mode: 'pessimistic_write' } });
      const extras = row ? (row.payload as Record<string, unknown>) : { id: snapshot.eventId };
      const actualRevision = planningRevision(extras);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      await repo.save({ matchId: snapshot.eventId, payload: { ...extras, ...patch, planningRevision: actualRevision + 1 } });
    });
    return;
  }

  if (snapshot.eventType === 'entrainement') {
    await db.transaction(async (manager) => {
      const repo = manager.getRepository<EntrainementEntity>('Entrainement');
      const row = await repo.findOne({ where: { id: snapshot.eventId }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new Error('Événement introuvable');
      const actualRevision = planningRevision(row.payload);
      assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
      row.payload = { ...(row.payload as Record<string, unknown>), ...patch, planningRevision: actualRevision + 1 };
      await repo.save(row);
    });
    return;
  }

  await db.transaction(async (manager) => {
    const repo = manager.getRepository<PlateauEntity>('Plateau');
    const row = await repo.findOne({ where: { id: snapshot.eventId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new Error('Événement introuvable');
    const actualRevision = planningRevision(row.payload);
    assertExpectedRevision(actualRevision, snapshot.revision ?? 0);
    row.payload = { ...(row.payload as Record<string, unknown>), ...patch, planningRevision: actualRevision + 1 };
    await repo.save(row);
  });
}
