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
 * Obtient les classes CSS pour le venue
 */
export function getVenueClasses(venue: 'domicile' | 'extérieur'): string {
  return venue === 'domicile'
    ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-orange-100 text-orange-800 border-orange-300';
}
