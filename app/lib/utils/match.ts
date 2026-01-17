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
