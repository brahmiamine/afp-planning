import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { MatchOfficialEntity } from '@/lib/db/schemas';
import { groupMatchesByDate } from '@/lib/db/helpers';
import {
  syncOfficialMatchesData,
  type OfficialMatchSyncResult,
} from '@/lib/db/json-migrator';
import type { Match, MatchesData } from '@/types/match';

const AUTO_RECONCILE_SCORE = 85;
const MIN_AMBIGUITY_GAP = 10;
const MAX_DATE_SHIFT_DAYS = 14;
const MAX_SOURCE_ID_HISTORY = 20;
const MAX_SOURCE_ID_LENGTH = 512;

export interface ExistingOfficialMatchIdentity {
  id: string;
  payload: Match;
}

export interface MatchIdentityDecision {
  sourceId: string;
  internalId: string;
  kind: 'exact' | 'reconciled' | 'new';
  score?: number;
  match: Match;
}

function normalizeIdentityText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCompetition(value: string | undefined): string {
  return normalizeIdentityText(value)
    .replace(/\bjournee\s+\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFootballDate(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const year = Number.parseInt(match[3] ?? '', 10);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function dateDistanceDays(left: string | undefined, right: string | undefined): number | null {
  const leftTime = parseFootballDate(left);
  const rightTime = parseFootballDate(right);
  if (leftTime === null || rightTime === null) return null;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function sourceSlugSignature(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutVolatileSuffix = trimmed.replace(/-[a-z0-9]{4,12}$/i, '');
  return normalizeIdentityText(withoutVolatileSuffix);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function sourceIdsForExisting(existing: ExistingOfficialMatchIdentity): string[] {
  const explicit = uniqueStrings([
    ...(Array.isArray(existing.payload.sourceMatchIds) ? existing.payload.sourceMatchIds : []),
    existing.payload.sourceMatchId,
  ]);
  // Compatibilité avec les lignes historiques : avant cette évolution, la PK DB était le slug source.
  return explicit.length > 0 ? explicit : [existing.id];
}

function boundedSourceHistory(existing: ExistingOfficialMatchIdentity | undefined, sourceId: string): string[] {
  const history = uniqueStrings([
    ...(existing ? sourceIdsForExisting(existing) : []),
    sourceId,
  ]);
  return history.slice(-MAX_SOURCE_ID_HISTORY);
}

function validatedSourceId(match: Match): string | null {
  const sourceId = match.id?.trim();
  if (!sourceId) return null;
  if (sourceId.length > MAX_SOURCE_ID_LENGTH) {
    throw new Error(`Identifiant de match source invalide : longueur supérieure à ${MAX_SOURCE_ID_LENGTH} caractères`);
  }
  return sourceId;
}

export function internalMatchIdForSource(clubId: string, sourceId: string): string {
  const digest = createHash('sha256')
    .update(clubId)
    .update('\0')
    .update(sourceId)
    .digest('hex');
  return `scr_${digest}`;
}

export function scoreOfficialMatchIdentity(
  previous: Match,
  incoming: Match,
  previousSourceIds: string[] = [],
): number {
  const previousLocal = normalizeIdentityText(previous.localTeam);
  const incomingLocal = normalizeIdentityText(incoming.localTeam);
  const previousAway = normalizeIdentityText(previous.awayTeam);
  const incomingAway = normalizeIdentityText(incoming.awayTeam);
  if (!previousLocal || !incomingLocal || previousLocal !== incomingLocal) return 0;
  if (!previousAway || !incomingAway || previousAway !== incomingAway) return 0;

  const previousCompetition = normalizeCompetition(previous.competition);
  const incomingCompetition = normalizeCompetition(incoming.competition);
  if (previousCompetition && incomingCompetition && previousCompetition !== incomingCompetition) return 0;

  const previousCategory = normalizeIdentityText(previous.categorie);
  const incomingCategory = normalizeIdentityText(incoming.categorie);
  if (previousCategory && incomingCategory && previousCategory !== incomingCategory) return 0;

  const dateDistance = dateDistanceDays(previous.date, incoming.date);
  if (dateDistance === null || dateDistance > MAX_DATE_SHIFT_DAYS) return 0;

  let score = 50; // équipes domicile/extérieur identiques
  if (previousCompetition && incomingCompetition) score += 20;
  if (previousCategory && incomingCategory) score += 10;
  if (previous.venue === incoming.venue) score += 5;

  if (dateDistance === 0) score += 15;
  else if (dateDistance <= 3) score += 12;
  else if (dateDistance <= 7) score += 8;
  else score += 4;

  const incomingSourceId = incoming.id?.trim();
  if (incomingSourceId) {
    const incomingSignature = sourceSlugSignature(incomingSourceId);
    if (
      incomingSignature
      && previousSourceIds.some((sourceId) => sourceSlugSignature(sourceId) === incomingSignature)
    ) {
      score += 10;
    }
  }

  return Math.min(100, score);
}

function buildAliasIndex(existing: ExistingOfficialMatchIdentity[]): Map<string, string | null> {
  const aliases = new Map<string, string | null>();
  for (const item of existing) {
    for (const sourceId of sourceIdsForExisting(item)) {
      const current = aliases.get(sourceId);
      if (current === undefined) aliases.set(sourceId, item.id);
      else if (current !== item.id) aliases.set(sourceId, null);
    }
  }
  return aliases;
}

export function reconcileOfficialMatchIdentities(
  clubId: string,
  existing: ExistingOfficialMatchIdentity[],
  incomingMatches: Match[],
  observedAt: string,
): MatchIdentityDecision[] {
  const existingByInternalId = new Map(existing.map((item) => [item.id, item]));
  const aliases = buildAliasIndex(existing);
  const deduplicatedIncoming = new Map<string, Match>();
  for (const match of incomingMatches) {
    const sourceId = validatedSourceId(match);
    if (sourceId) deduplicatedIncoming.set(sourceId, match);
  }

  // Les correspondances exactes sont réservées avant le fuzzy matching afin qu'un
  // nouveau slug ressemblant ne puisse jamais "voler" un match dont l'ID source est encore présent.
  const exactBySourceId = new Map<string, string>();
  const reservedInternalIds = new Set<string>();
  for (const sourceId of deduplicatedIncoming.keys()) {
    const exactInternalId = aliases.get(sourceId);
    if (exactInternalId && !reservedInternalIds.has(exactInternalId)) {
      exactBySourceId.set(sourceId, exactInternalId);
      reservedInternalIds.add(exactInternalId);
    }
  }

  const claimedInternalIds = new Set(reservedInternalIds);
  const decisions: MatchIdentityDecision[] = [];

  for (const [sourceId, incoming] of deduplicatedIncoming) {
    const exactInternalId = exactBySourceId.get(sourceId);
    let internalId: string;
    let kind: MatchIdentityDecision['kind'];
    let score: number | undefined;
    let previous: ExistingOfficialMatchIdentity | undefined;

    if (exactInternalId) {
      internalId = exactInternalId;
      kind = 'exact';
      previous = existingByInternalId.get(internalId);
    } else {
      const candidates = existing
        .filter((item) => !claimedInternalIds.has(item.id))
        .map((item) => ({
          item,
          score: scoreOfficialMatchIdentity(item.payload, incoming, sourceIdsForExisting(item)),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score);

      const best = candidates[0];
      const second = candidates[1];
      const unambiguous = best
        && best.score >= AUTO_RECONCILE_SCORE
        && (!second || best.score - second.score >= MIN_AMBIGUITY_GAP);

      if (unambiguous && best) {
        internalId = best.item.id;
        kind = 'reconciled';
        score = best.score;
        previous = best.item;
        claimedInternalIds.add(internalId);
      } else {
        internalId = internalMatchIdForSource(clubId, sourceId);
        kind = 'new';
      }
    }

    const sourceMatchIds = boundedSourceHistory(previous, sourceId);
    const match: Match = {
      ...incoming,
      id: internalId,
      sourceMatchId: sourceId,
      sourceMatchIds,
      ...(kind === 'reconciled'
        ? { sourceIdentityReconciledAt: observedAt, sourceIdentityConfidence: score }
        : previous
          ? {
              sourceIdentityReconciledAt: previous.payload.sourceIdentityReconciledAt,
              sourceIdentityConfidence: previous.payload.sourceIdentityConfidence,
            }
          : {}),
    };

    decisions.push({ sourceId, internalId, kind, score, match });
  }

  return decisions;
}

export async function syncOfficialMatchesWithIdentityReconciliation(
  db: DataSource,
  input: MatchesData,
  clubId: string,
): Promise<OfficialMatchSyncResult> {
  const existingRows = await db.getRepository<MatchOfficialEntity>('MatchOfficial').findBy({ clubId });
  const existing: ExistingOfficialMatchIdentity[] = existingRows.map((row) => ({
    id: row.id,
    payload: row.payload as unknown as Match,
  }));
  const observedAt = input.scrapedAt || new Date().toISOString();
  const incomingMatches = Object.values(input.matches ?? {}).flat();
  const decisions = reconcileOfficialMatchIdentities(clubId, existing, incomingMatches, observedAt);
  const reconciledInput: MatchesData = {
    ...input,
    scrapedAt: observedAt,
    matches: groupMatchesByDate(decisions.map((decision) => decision.match)),
  };
  return syncOfficialMatchesData(db, reconciledInput, clubId);
}
