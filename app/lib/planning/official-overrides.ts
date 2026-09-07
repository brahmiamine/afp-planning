import type {
  Match,
  OfficialFieldOverride,
  OfficialFieldOverrides,
  OfficialOverridableField,
} from '@/types/match';

/**
 * Autorité des champs d'un match officiel (issue #151) : la source scrapée reste
 * autoritaire sauf pour ces champs, qu'un administrateur peut corriger. La correction
 * est conservée séparément (`match.sourceOverrides`) et réappliquée après chaque
 * synchronisation, jusqu'à ce que l'administrateur revienne à la valeur de la source.
 */
export const OFFICIAL_OVERRIDABLE_FIELDS: readonly OfficialOverridableField[] = [
  'date',
  'time',
  'horaireRendezVous',
  'stadium',
  'address',
];

export interface OfficialOverrideDrift {
  field: OfficialOverridableField;
  overrideValue: string;
  previousSourceValue: string;
  sourceValue: string;
}

export function readOfficialField(match: Match, field: OfficialOverridableField): string {
  if (field === 'stadium') return match.details?.stadium ?? '';
  if (field === 'address') return match.details?.address ?? '';
  return match[field] ?? '';
}

function writeOfficialField(match: Match, field: OfficialOverridableField, value: string): Match {
  if (field === 'stadium' || field === 'address') {
    if (!match.details) return match;
    return { ...match, details: { ...match.details, [field]: value } };
  }
  return { ...match, [field]: value };
}

/**
 * Compare la version enregistrée par l'administrateur à la valeur autoritaire de la
 * source pour produire le nouvel ensemble de corrections. Revenir à la valeur source
 * supprime la correction (« revenir à la source »).
 */
export function computeOfficialOverrides(
  previous: Match,
  updated: Match,
  options: { at: string; userId?: number },
): OfficialFieldOverrides {
  const existing = previous.sourceOverrides ?? {};
  const next: OfficialFieldOverrides = {};
  for (const field of OFFICIAL_OVERRIDABLE_FIELDS) {
    const sourceValue = existing[field]?.sourceValue ?? readOfficialField(previous, field);
    const value = readOfficialField(updated, field);
    if (value === sourceValue) continue;
    const unchanged = existing[field]?.value === value;
    next[field] = {
      value,
      sourceValue,
      updatedAt: unchanged ? existing[field]!.updatedAt : options.at,
      ...(unchanged ? {} : { updatedByUserId: options.userId }),
      ...(existing[field]?.sourceChangedAt ? { sourceChangedAt: existing[field]!.sourceChangedAt } : {}),
    } satisfies OfficialFieldOverride;
  }
  return next;
}

/**
 * Réapplique les corrections manuelles sur un match fraîchement scrapé et signale les
 * écarts (la source a changé depuis la correction) pour qu'ils soient tracés.
 */
export function applyOfficialOverrides(
  incoming: Match,
  overrides: OfficialFieldOverrides | undefined,
  observedAt: string,
): { match: Match; drifts: OfficialOverrideDrift[] } {
  const entries = Object.entries(overrides ?? {}) as Array<[OfficialOverridableField, OfficialFieldOverride]>;
  if (entries.length === 0) return { match: incoming, drifts: [] };

  const drifts: OfficialOverrideDrift[] = [];
  const nextOverrides: OfficialFieldOverrides = {};
  let match = incoming;
  for (const [field, override] of entries) {
    const sourceValue = readOfficialField(incoming, field);
    if (sourceValue === override.value) continue;
    const drifted = sourceValue !== override.sourceValue;
    if (drifted) {
      drifts.push({
        field,
        overrideValue: override.value,
        previousSourceValue: override.sourceValue,
        sourceValue,
      });
    }
    nextOverrides[field] = {
      ...override,
      sourceValue,
      ...(drifted ? { sourceChangedAt: observedAt } : {}),
    };
    match = writeOfficialField(match, field, override.value);
  }

  const hasOverrides = Object.keys(nextOverrides).length > 0;
  return {
    match: { ...match, ...(hasOverrides ? { sourceOverrides: nextOverrides } : { sourceOverrides: undefined }) },
    drifts,
  };
}
