import type {
  Match,
  MatchDetails,
  MatchStaff,
  OfficialMatchAdminOverride,
} from '@/types/match';

const TOP_LEVEL_FIELDS = [
  'date',
  'time',
  'durationMinutes',
  'localTeam',
  'awayTeam',
  'competition',
  'categorie',
  'venue',
  'horaireRendezVous',
] as const;

const DETAIL_FIELDS = ['stadium', 'address', 'terrainType', 'itineraryLink'] as const;
const STAFF_FIELDS = ['referee', 'assistant1', 'assistant2'] as const;

function sameValue(left: unknown, right: unknown): boolean {
  return left === right;
}

function compactNested<T extends Record<string, unknown>>(value: T): T | undefined {
  return Object.keys(value).length ? value : undefined;
}

/**
 * Autorité des champs d'un match officiel :
 * - le scraper reste la source pour tous les champs ;
 * - seuls les champs éditables explicitement modifiés par un administrateur sont
 *   conservés comme override ;
 * - les métadonnées techniques du scraper (rawText, url, sourceStatus, identités)
 *   ne sont jamais écrasées par un override.
 */
export function computeOfficialMatchAdminOverride(
  source: Match,
  effective: Match,
): OfficialMatchAdminOverride {
  const override: OfficialMatchAdminOverride = {};

  for (const field of TOP_LEVEL_FIELDS) {
    if (!sameValue(source[field], effective[field])) {
      (override as Record<string, unknown>)[field] = effective[field];
    }
  }

  const details: Partial<Pick<MatchDetails, 'stadium' | 'address' | 'terrainType' | 'itineraryLink'>> = {};
  for (const field of DETAIL_FIELDS) {
    if (!sameValue(source.details?.[field], effective.details?.[field])) {
      (details as Record<string, unknown>)[field] = effective.details?.[field] ?? '';
    }
  }
  if (source.details !== effective.details && effective.details === null) {
    override.details = null;
  } else {
    const compact = compactNested(details as Record<string, unknown>);
    if (compact) override.details = compact as typeof details;
  }

  const staff: Partial<Pick<MatchStaff, 'referee' | 'assistant1' | 'assistant2'>> = {};
  for (const field of STAFF_FIELDS) {
    if (!sameValue(source.staff?.[field], effective.staff?.[field])) {
      (staff as Record<string, unknown>)[field] = effective.staff?.[field] ?? '';
    }
  }
  if (source.staff !== effective.staff && effective.staff === null) {
    override.staff = null;
  } else {
    const compact = compactNested(staff as Record<string, unknown>);
    if (compact) override.staff = compact as typeof staff;
  }

  return override;
}

export function hasOfficialMatchAdminOverride(override: OfficialMatchAdminOverride | null | undefined): boolean {
  return !!override && Object.keys(override).length > 0;
}

export function applyOfficialMatchAdminOverride(
  source: Match,
  override: OfficialMatchAdminOverride | null | undefined,
): Match {
  if (!hasOfficialMatchAdminOverride(override)) return source;

  const next: Match = {
    ...source,
    ...override,
    details: override?.details === null
      ? null
      : source.details || override?.details
        ? {
            ...(source.details ?? {
              stadium: '',
              dateTime: '',
              competition: source.competition,
              address: '',
              terrainType: '',
              itineraryLink: '',
              rawText: '',
            }),
            ...(override?.details ?? {}),
          }
        : source.details,
    staff: override?.staff === null
      ? null
      : source.staff || override?.staff
        ? {
            ...(source.staff ?? {
              referee: '',
              assistant1: '',
              assistant2: '',
              rawText: '',
            }),
            ...(override?.staff ?? {}),
          }
        : source.staff,
  };

  if (next.details) {
    next.details = {
      ...next.details,
      dateTime: `${next.date} - ${next.time}`,
      competition: next.competition,
    };
  }

  return next;
}

export function listOfficialMatchOverrideFields(
  override: OfficialMatchAdminOverride | null | undefined,
): string[] {
  if (!override) return [];
  const fields: string[] = [];
  for (const field of TOP_LEVEL_FIELDS) {
    if (field in override) fields.push(field);
  }
  if (override.details !== undefined) {
    if (override.details === null) fields.push('details');
    else for (const field of DETAIL_FIELDS) if (field in override.details) fields.push(`details.${field}`);
  }
  if (override.staff !== undefined) {
    if (override.staff === null) fields.push('staff');
    else for (const field of STAFF_FIELDS) if (field in override.staff) fields.push(`staff.${field}`);
  }
  return fields;
}
