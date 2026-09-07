/**
 * Utilitaires pour les matchs
 */

import { Match } from '@/types/match';

/**
 * Calcule le nombre total de matchs
 */
export function getTotalMatches(matches: Record<string, Match[]>): number {
  return Object.values(matches).reduce((acc, matchList) => acc + matchList.length, 0);
}

/**
 * Obtient le nombre de matchs pour la première date
 */
export function getFirstDateMatchesCount(matches: Record<string, Match[]>): number {
  const firstKey = Object.keys(matches)[0];
  return firstKey ? (matches[firstKey]?.length || 0) : 0;
}

/**
 * Calcule les statistiques des matchs
 */
export function calculateMatchStats(matches: Record<string, Match[]>) {
  return {
    totalDates: Object.keys(matches).length,
    totalMatches: getTotalMatches(matches),
    firstDateMatches: getFirstDateMatchesCount(matches),
  };
}

/**
 * Calcule les statistiques détaillées des matchs (par venue)
 */
export function calculateDetailedMatchStats(matches: Record<string, Match[]>) {
  let homeMatches = 0;
  let awayMatches = 0;
  
  Object.values(matches).forEach((matchList) => {
    matchList.forEach((match) => {
      if (match.venue === 'domicile') {
        homeMatches++;
      } else if (match.venue === 'extérieur') {
        awayMatches++;
      }
    });
  });

  return {
    totalDates: Object.keys(matches).length,
    totalMatches: getTotalMatches(matches),
    homeMatches,
    awayMatches,
  };
}

/**
 * Obtient les classes CSS pour le venue
 */
export function getVenueClasses(venue: 'domicile' | 'extérieur'): string {
  return venue === 'domicile'
    ? 'bg-secondary text-secondary-foreground border-border'
    : 'bg-accent text-accent-foreground border-border';
}

export interface ClubLogoLookup {
  nom: string;
  logo: string;
}

/**
 * Normalise un nom d'équipe/club pour la comparaison :
 * - suppression des accents et de la casse
 * - suppression des suffixes de catégorie/équipe (U15, Séniors, R1, Poule A, Équipe 2, ...)
 * - réduction de la ponctuation à des espaces simples
 */
export function normalizeClubName(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(
      /\b(u\s?\d{1,2}|seniors?|feminines?|feminine|veterans?|loisirs?|r\d|d\d|n\d|div\s?\d|poule\s?[a-z0-9]+|groupe\s?[a-z0-9]+|equipe\s?\d+|(?:1er?|2e?|3e?|4e?|1ere?|2eme?|3eme?)\s?(?:equipe|team)?)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    // Recolle les initiales séparées ("f c versailles" -> "fc versailles", "a s" -> "as")
    .replace(/\b([a-z]) (?=[a-z]\b)/g, '$1');
}

function clubNameTokens(value: string): string[] {
  return normalizeClubName(value).split(' ').filter(Boolean);
}

function acronymOf(value: string): string {
  return clubNameTokens(value)
    .filter((token) => !/^\d+$/.test(token))
    .map((token) => token[0])
    .join('');
}

/**
 * Retrouve le logo d'un club dans la liste connue avec une comparaison tolérante
 * (nom exact normalisé, préfixe commun, sous-ensemble de mots, ou acronyme).
 */
export function findTeamLogo(
  teamName: string | undefined | null,
  clubs: ClubLogoLookup[],
): string | undefined {
  const target = normalizeClubName(teamName);
  if (!target || clubs.length === 0) return undefined;
  const targetTokens = target.split(' ').filter(Boolean);
  const targetAcronym = acronymOf(teamName ?? '');

  let prefixMatch: string | undefined;
  let subsetMatch: string | undefined;
  let acronymMatch: string | undefined;

  for (const club of clubs) {
    if (!club.logo) continue;
    const candidate = normalizeClubName(club.nom);
    if (!candidate) continue;

    if (candidate === target) return club.logo;

    if (
      !prefixMatch &&
      target.length >= 5 &&
      candidate.length >= 5 &&
      (candidate.startsWith(target) || target.startsWith(candidate))
    ) {
      prefixMatch = club.logo;
    }

    if (!subsetMatch) {
      const candidateTokens = candidate.split(' ').filter(Boolean);
      const [shorter, longer] =
        candidateTokens.length <= targetTokens.length
          ? [candidateTokens, targetTokens]
          : [targetTokens, candidateTokens];
      const meaningful = shorter.filter((token) => token.length >= 3);
      if (
        meaningful.length >= 2 &&
        meaningful.every((token) => longer.includes(token))
      ) {
        subsetMatch = club.logo;
      }
    }

    if (!acronymMatch) {
      const candidateTokens = candidate.split(' ').filter(Boolean);
      const candidateAcronym = acronymOf(club.nom);
      if (
        (targetAcronym.length >= 3 && candidateAcronym.length >= 3 && candidateAcronym === targetAcronym) ||
        (candidateAcronym.length >= 3 && targetTokens.includes(candidateAcronym)) ||
        (targetAcronym.length >= 3 && candidateTokens.includes(targetAcronym))
      ) {
        acronymMatch = club.logo;
      }
    }
  }

  return prefixMatch ?? subsetMatch ?? acronymMatch;
}

/**
 * Résout les logos des deux équipes d'un match :
 * 1. logos déjà présents sur le match (issus du scraper)
 * 2. logo du club de l'utilisateur (paramètres) si l'équipe correspond
 * 3. recherche tolérante dans la liste des clubs connus
 */
export function resolveMatchLogos(
  match: Pick<Match, 'localTeam' | 'awayTeam' | 'localTeamLogo' | 'awayTeamLogo'>,
  clubs: ClubLogoLookup[],
  ownClub?: { name?: string; logo?: string },
): { localTeamLogo?: string; awayTeamLogo?: string } {
  const ownName = normalizeClubName(ownClub?.name);
  const ownAcronym = acronymOf(ownClub?.name ?? '');
  const ownLogo = ownClub?.logo || undefined;

  const matchesOwnClub = (teamName: string | undefined | null): boolean => {
    if (!ownLogo || !ownName) return false;
    const team = normalizeClubName(teamName);
    if (!team) return false;
    if (team === ownName || team.startsWith(ownName) || ownName.startsWith(team)) return true;
    const teamTokens = team.split(' ').filter(Boolean);
    return ownAcronym.length >= 3 && teamTokens.includes(ownAcronym);
  };

  const resolve = (
    explicit: string | undefined,
    teamName: string,
  ): string | undefined =>
    explicit || (matchesOwnClub(teamName) ? ownLogo : undefined) || findTeamLogo(teamName, clubs);

  return {
    localTeamLogo: resolve(match.localTeamLogo, match.localTeam),
    awayTeamLogo: resolve(match.awayTeamLogo, match.awayTeam),
  };
}
