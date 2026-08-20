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
  };
}

export async function listPlanningEventSnapshots(db: DataSource): Promise<PlanningEventSnapshot[]> {
  const [officialRows, friendlyRows, trainingRows, plateauRows, extraRows] = await Promise.all([
    db.getRepository<MatchOfficialEntity>('MatchOfficial').find(),
    db.getRepository<MatchAmicalEntity>('MatchAmical').find(),
    db.getRepository<EntrainementEntity>('Entrainement').find(),
    db.getRepository<PlateauEntity>('Plateau').find(),
    db.getRepository<MatchExtraEntity>('MatchExtra').find(),
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
  for (const row of trainingRows) snapshots.push(simpleSnapshot(row.payload as unknown as Entrainement));
  for (const row of plateauRows) snapshots.push(simpleSnapshot(row.payload as unknown as Plateau));
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
): Promise<void> {
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    const repo = db.getRepository<MatchExtraEntity>('MatchExtra');
    const row = await repo.findOneBy({ matchId: snapshot.eventId });
    const extras: MatchExtras = row
      ? (row.payload as unknown as MatchExtras)
      : { id: snapshot.eventId };

    if (role === 'arbitre') extras.arbitreTouche = contacts;
    if (role === 'encadrant') extras.contactEncadrants = contacts;
    if (role === 'accompagnateur') extras.contactAccompagnateur = contacts;

    await repo.save({
      matchId: snapshot.eventId,
      payload: extras as unknown as Record<string, unknown>,
    });
    return;
  }

  if (role !== 'encadrant') throw new Error('Ce rôle n’est pas disponible pour cet événement');
  if (snapshot.eventType === 'entrainement') {
    const repo = db.getRepository<EntrainementEntity>('Entrainement');
    const row = await repo.findOneBy({ id: snapshot.eventId });
    if (!row) throw new Error('Événement introuvable');
    row.payload = { ...(row.payload as Record<string, unknown>), encadrants: contacts };
    await repo.save(row);
    return;
  }

  const repo = db.getRepository<PlateauEntity>('Plateau');
  const row = await repo.findOneBy({ id: snapshot.eventId });
  if (!row) throw new Error('Événement introuvable');
  row.payload = { ...(row.payload as Record<string, unknown>), encadrants: contacts };
  await repo.save(row);
}

export async function savePlanningPublication(
  db: DataSource,
  snapshot: PlanningEventSnapshot,
  patch: Record<string, unknown>,
): Promise<void> {
  if (snapshot.eventType === 'officiel' || snapshot.eventType === 'amical') {
    const repo = db.getRepository<MatchExtraEntity>('MatchExtra');
    const row = await repo.findOneBy({ matchId: snapshot.eventId });
    const extras = row ? (row.payload as Record<string, unknown>) : { id: snapshot.eventId };
    await repo.save({
      matchId: snapshot.eventId,
      payload: { ...extras, ...patch },
    });
    return;
  }

  if (snapshot.eventType === 'entrainement') {
    const repo = db.getRepository<EntrainementEntity>('Entrainement');
    const row = await repo.findOneBy({ id: snapshot.eventId });
    if (!row) throw new Error('Événement introuvable');
    row.payload = { ...(row.payload as Record<string, unknown>), ...patch };
    await repo.save(row);
    return;
  }

  const repo = db.getRepository<PlateauEntity>('Plateau');
  const row = await repo.findOneBy({ id: snapshot.eventId });
  if (!row) throw new Error('Événement introuvable');
  row.payload = { ...(row.payload as Record<string, unknown>), ...patch };
  await repo.save(row);
}
