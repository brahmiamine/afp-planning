import { DEFAULT_APP_SETTINGS, roleLabelWithClub } from '@/lib/settings';
import type { Match } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';

export interface ShareCardPalette {
  primary: string;
  secondary: string;
  onPrimary: string;
  onSecondary: string;
  mutedOnSecondary: string;
  chipOnPrimary: string;
}

export interface ShareCardFact {
  label: string;
  value: string;
}

function parseHex(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) {
    if (candidate.length === 4) {
      const r = candidate[1] ?? '0';
      const g = candidate[2] ?? '0';
      const b = candidate[3] ?? '0';
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return candidate.toLowerCase();
  }
  return fallback.toLowerCase();
}

function luminance(hex: string): number {
  const digits = hex.slice(1);
  const channel = (start: number) => {
    const value = Number.parseInt(digits.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function readableOn(hex: string): string {
  return luminance(hex) > 0.55 ? '#111827' : '#f8fafc';
}

function mix(hex: string, other: string, amount: number): string {
  const toRgb = (value: string) => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = toRgb(hex);
  const [r2, g2, b2] = toRgb(other);
  const mixChannel = (a = 0, b = 0) => Math.round(a + (b - a) * amount);
  return `#${[mixChannel(r1, r2), mixChannel(g1, g2), mixChannel(b1, b2)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function resolveShareCardPalette(primaryColor?: string, secondaryColor?: string): ShareCardPalette {
  const primary = parseHex(primaryColor, DEFAULT_APP_SETTINGS.primaryColor);
  const secondary = parseHex(secondaryColor, DEFAULT_APP_SETTINGS.accentColor);
  const onSecondary = readableOn(secondary);
  return {
    primary,
    secondary,
    onPrimary: readableOn(primary),
    onSecondary,
    mutedOnSecondary: mix(onSecondary, secondary, 0.42),
    chipOnPrimary: mix(primary, onSecondary === '#f8fafc' ? '#ffffff' : '#111827', 0.18),
  };
}

function compactLocality(address?: string): string {
  const trimmed = address?.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[-–]\s*/).map((part) => part.trim()).filter(Boolean);
  const locality = parts[parts.length - 1] || trimmed;
  return locality === trimmed && trimmed.length > 42 ? `${trimmed.slice(0, 39)}…` : locality;
}

function contactNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === 'object' && 'nom' in item ? String(item.nom || '').trim() : ''))
      .filter(Boolean);
  }
  if (value && typeof value === 'object' && 'nom' in value) {
    const nom = String((value as { nom?: string }).nom || '').trim();
    return nom ? [nom] : [];
  }
  return [];
}

export function collectShareCardFacts(
  match: Match,
  extras?: MatchExtras | null,
  clubAbbreviation?: string,
): ShareCardFact[] {
  const abbr = clubAbbreviation?.trim() ?? '';
  const role = (base: string) => roleLabelWithClub(base, abbr);
  const facts: ShareCardFact[] = [];

  if (match.details?.stadium) {
    const locality = compactLocality(match.details.address);
    facts.push({
      label: 'Lieu',
      value: locality ? `${match.details.stadium}\n${locality}` : match.details.stadium,
    });
  }
  if (match.details?.terrainType) {
    facts.push({ label: 'Terrain', value: match.details.terrainType });
  }

  const arbitres = contactNames(extras?.arbitreTouche);
  if (arbitres.length) facts.push({ label: role('Arbitre'), value: arbitres.join(', ') });
  else if (match.staff?.referee) facts.push({ label: 'Arbitre', value: match.staff.referee });

  const encadrants = contactNames(extras?.contactEncadrants);
  if (encadrants.length) facts.push({ label: role('Encadrant'), value: encadrants.join(', ') });

  const accompagnateurs = contactNames(extras?.contactAccompagnateur);
  if (accompagnateurs.length) facts.push({ label: role('Accompagnateur'), value: accompagnateurs.join(', ') });

  if (match.staff?.assistant1) facts.push({ label: 'Assistant 1', value: match.staff.assistant1 });
  if (match.staff?.assistant2) facts.push({ label: 'Assistant 2', value: match.staff.assistant2 });

  return facts.slice(0, 3);
}

export function matchTypeLabel(type?: string): string | null {
  if (type === 'officiel') return 'Officiel';
  if (type === 'amical') return 'Amical';
  if (type === 'entrainement') return 'Entraînement';
  if (type === 'plateau') return 'Plateau';
  return type ? type : null;
}

export function venueLabel(venue?: string): string {
  return venue === 'extérieur' ? 'Extérieur' : 'Domicile';
}

export interface ShareCardModel {
  palette: ShareCardPalette;
  clubName: string;
  date: string;
  time: string;
  rendezVous: string;
  competition: string;
  category: string;
  typeLabel: string | null;
  venue: string;
  homeTeam: string;
  awayTeam: string;
  facts: ShareCardFact[];
}

export function buildShareCardModel(options: {
  match: Match;
  extras?: MatchExtras | null;
  clubName?: string;
  clubAbbreviation?: string;
  primaryColor?: string;
  secondaryColor?: string;
}): ShareCardModel {
  const { match, extras, clubName, clubAbbreviation, primaryColor, secondaryColor } = options;
  const meta = [match.competition, match.categorie].filter(Boolean).join(' · ');
  return {
    palette: resolveShareCardPalette(primaryColor, secondaryColor),
    clubName: clubName?.trim() || '',
    date: match.date,
    time: match.time,
    rendezVous: match.horaireRendezVous?.trim() || '',
    competition: meta,
    category: match.categorie?.trim() || '',
    typeLabel: matchTypeLabel(match.type),
    venue: venueLabel(match.venue),
    homeTeam: match.localTeam,
    awayTeam: match.awayTeam,
    facts: collectShareCardFacts(match, extras, clubAbbreviation),
  };
}
