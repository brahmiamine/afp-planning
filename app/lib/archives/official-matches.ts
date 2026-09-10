import type { Match, PlanningPublicationStatus } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { eventEndTimestamp, eventStartTimestamp } from '@/lib/planning/p0-rules';
import { eventWorkspaceHref } from '@/lib/planning/event-links';

export type ArchiveBadge = 'past' | 'missing' | 'cancelled';

export const ARCHIVE_BADGE_LABELS: Record<ArchiveBadge, string> = {
  past: 'Passé',
  missing: 'Disparu de la source',
  cancelled: 'Annulé',
};

export interface OfficialArchiveRow {
  id: string;
  date: string;
  time: string;
  competition: string;
  categorie: string | null;
  localTeam: string;
  awayTeam: string;
  localTeamLogo: string | null;
  awayTeamLogo: string | null;
  venue: Match['venue'];
  stadium: string | null;
  planningStatus: PlanningPublicationStatus | null;
  sourceStatus: Match['sourceStatus'];
  sourceLastSeenAt: string | null;
  sourceMissingSince: string | null;
  sourceMissingObservations: number | null;
  cancellationReason: string | null;
  badges: ArchiveBadge[];
  workspaceHref: string;
  year: string | null;
}

function matchYear(date: string): string | null {
  const match = date.match(/(\d{4})$/);
  return match?.[1] ?? null;
}

function extrasStatus(extras: MatchExtras | null | undefined, match: Match): PlanningPublicationStatus | null {
  const fromExtras = extras?.planningStatus;
  const fromMatch = match.planningStatus;
  if (fromExtras === 'draft' || fromExtras === 'published' || fromExtras === 'modified' || fromExtras === 'cancelled') {
    return fromExtras;
  }
  if (fromMatch === 'draft' || fromMatch === 'published' || fromMatch === 'modified' || fromMatch === 'cancelled') {
    return fromMatch;
  }
  return null;
}

export function isPastOfficialMatch(match: Match, timeZone: string, now: number): boolean {
  const duration = match.durationMinutes && match.durationMinutes > 0 ? match.durationMinutes : 0;
  const timestamp = duration > 0
    ? eventEndTimestamp(match.date, match.time, duration, timeZone)
    : eventStartTimestamp(match.date, match.time, timeZone);
  return timestamp !== null && timestamp < now;
}

export function officialArchiveBadges(
  match: Match,
  extras: MatchExtras | null | undefined,
  timeZone: string,
  now: number,
): ArchiveBadge[] {
  const badges: ArchiveBadge[] = [];
  if (isPastOfficialMatch(match, timeZone, now)) badges.push('past');
  if (match.sourceStatus === 'missing' || extras?.sourceStatus === 'missing') badges.push('missing');
  if (extrasStatus(extras, match) === 'cancelled') badges.push('cancelled');
  return badges;
}

export function toOfficialArchiveRow(
  match: Match,
  extras: MatchExtras | null | undefined,
  timeZone: string,
  now: number,
): OfficialArchiveRow | null {
  const id = match.id?.trim();
  if (!id) return null;
  const badges = officialArchiveBadges(match, extras, timeZone, now);
  if (badges.length === 0) return null;

  return {
    id,
    date: match.date,
    time: match.time,
    competition: match.competition,
    categorie: match.categorie ?? null,
    localTeam: match.localTeam,
    awayTeam: match.awayTeam,
    localTeamLogo: match.localTeamLogo ?? null,
    awayTeamLogo: match.awayTeamLogo ?? null,
    venue: match.venue,
    stadium: match.details?.stadium ?? null,
    planningStatus: extrasStatus(extras, match),
    sourceStatus: match.sourceStatus ?? extras?.sourceStatus,
    sourceLastSeenAt: match.sourceLastSeenAt ?? extras?.sourceLastSeenAt ?? null,
    sourceMissingSince: match.sourceMissingSince ?? extras?.sourceMissingSince ?? null,
    sourceMissingObservations: match.sourceMissingObservations ?? extras?.sourceMissingObservations ?? null,
    cancellationReason: extras?.cancellationReason ?? match.cancellationReason ?? null,
    badges,
    workspaceHref: eventWorkspaceHref('officiel', id, 'dashboard'),
    year: matchYear(match.date),
  };
}

export interface OfficialArchiveFilters {
  query?: string;
  year?: string | 'all';
  badge?: ArchiveBadge | 'all';
  categorie?: string | 'all';
}

export function filterOfficialArchives(
  rows: OfficialArchiveRow[],
  filters: OfficialArchiveFilters = {},
): OfficialArchiveRow[] {
  const query = (filters.query ?? '').trim().toLocaleLowerCase('fr');
  const year = filters.year && filters.year !== 'all' ? filters.year : null;
  const badge = filters.badge && filters.badge !== 'all' ? filters.badge : null;
  const categorie = filters.categorie && filters.categorie !== 'all' ? filters.categorie : null;

  const filtered = rows.filter((row) => {
    if (query) {
      const haystack = `${row.localTeam} ${row.awayTeam} ${row.competition}`.toLocaleLowerCase('fr');
      if (!haystack.includes(query)) return false;
    }
    if (year && row.year !== year) return false;
    if (badge && !row.badges.includes(badge)) return false;
    if (categorie && row.categorie !== categorie) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    const [dayA, monthA, yearA] = a.date.split('/').map((part) => Number.parseInt(part, 10));
    const [dayB, monthB, yearB] = b.date.split('/').map((part) => Number.parseInt(part, 10));
    const byDate = Date.UTC(yearB || 0, (monthB || 1) - 1, dayB || 1) - Date.UTC(yearA || 0, (monthA || 1) - 1, dayA || 1);
    if (byDate !== 0) return byDate;
    return (b.time || '').localeCompare(a.time || '');
  });
}
