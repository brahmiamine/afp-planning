import type { Match, Entrainement, Plateau } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type { MatchFilters } from '@/components/matches/MatchFilters';

type Event = Match | Entrainement | Plateau;

export function eventTypeOf(event: Event): 'officiel' | 'amical' | 'entrainement' | 'plateau' | undefined {
  if ('type' in event && event.type) return event.type;
  if ('localTeam' in event || 'competition' in event) return 'officiel';
  return undefined;
}

export function hasActiveFilters(filters: MatchFilters): boolean {
  return filters.clubSearch !== '' || filters.arbitreAFPSearch !== ''
    || filters.venue !== 'all' || filters.eventType !== 'all';
}

/**
 * Filtre une liste d'événements groupée par date pour l'affichage de la préparation du
 * planning (issue #189). `allExtras` (clé = id de match) fournit les affectations
 * brouillon des matchs officiels/amicaux pour la recherche « arbitre AFP », absentes du
 * payload de base de l'événement.
 */
export function filterEventsByDate(
  events: Record<string, Event[]>,
  filters: MatchFilters,
  allExtras: Record<string, MatchExtras> | undefined,
): Record<string, Event[]> {
  if (!hasActiveFilters(filters)) return events;

  const clubTerm = filters.clubSearch.trim().toLowerCase();
  const arbitreTerm = filters.arbitreAFPSearch.trim().toLowerCase();
  const result: Record<string, Event[]> = {};

  for (const [date, dateEvents] of Object.entries(events)) {
    const kept = dateEvents.filter((event) => {
      const eventType = eventTypeOf(event);
      if (filters.eventType !== 'all' && eventType !== filters.eventType) return false;

      const isMatch = 'localTeam' in event || 'competition' in event;
      if (filters.venue !== 'all') {
        if (!isMatch || (event as Match).venue !== filters.venue) return false;
      }

      if (clubTerm) {
        if (!isMatch) return false;
        const match = event as Match;
        const haystack = `${match.localTeam ?? ''} ${match.awayTeam ?? ''}`.toLowerCase();
        if (!haystack.includes(clubTerm)) return false;
      }

      if (arbitreTerm) {
        const extras = event.id ? allExtras?.[event.id] : undefined;
        const contacts = extras?.arbitreTouche ?? [];
        const matchesContact = contacts.some((contact) => contact.nom.toLowerCase().includes(arbitreTerm));
        if (!matchesContact) return false;
      }

      return true;
    });
    if (kept.length) result[date] = kept;
  }

  return result;
}
