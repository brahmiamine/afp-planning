'use client';

import { useState, useMemo } from 'react';
import { useMatches } from './hooks/useMatches';
import { useMatchesAmicaux } from './hooks/useMatchesAmicaux';
import { useEntrainements } from './hooks/useEntrainements';
import { usePlateaux } from './hooks/usePlateaux';
import { Header } from './components/layout/Header';
import { MatchStats } from './components/layout/MatchStats';
import { EventList } from './components/events/EventList';
import { MatchFilters, MatchFilters as MatchFiltersType } from './components/matches/MatchFilters';
import { LoadingSpinner } from './components/ui/loading-spinner';
import { ErrorMessage } from './components/ui/error-message';
import { ViewToggle, ViewMode } from './components/ui/view-toggle';
import { formatDateFrench } from './lib/utils/date';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useAllMatchExtras } from './hooks/useAllMatchExtras';

type Event = Match | Entrainement | Plateau;

export default function Home() {
  const { matchesData, isLoading, error, reload } = useMatches();
  const { matchesData: matchesAmicauxData, reload: reloadAmicaux } = useMatchesAmicaux();
  const { data: entrainementsData, reload: reloadEntrainements } = useEntrainements();
  const { data: plateauxData, reload: reloadPlateaux } = usePlateaux();
  const { allExtras } = useAllMatchExtras();
  const [view, setView] = useState<ViewMode>('card');
  const [filters, setFilters] = useState<MatchFiltersType>({
    clubSearch: '',
    arbitreAFPSearch: '',
    venue: 'all',
    completed: 'all',
  });

  const isLoadingAll = isLoading || 
    matchesAmicauxData === null || 
    entrainementsData === null || 
    plateauxData === null;

  const reloadAll = () => {
    reload();
    reloadAmicaux();
    reloadEntrainements();
    reloadPlateaux();
  };

  // Combiner tous les événements
  const allEvents = useMemo(() => {
    const combined: Record<string, Event[]> = {};

    // Ajouter les matchs officiels
    if (matchesData?.matches) {
      Object.entries(matchesData.matches).forEach(([date, matches]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...matches);
      });
    }

    // Ajouter les matchs amicaux
    if (matchesAmicauxData?.matches) {
      Object.entries(matchesAmicauxData.matches).forEach(([date, matches]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...matches);
      });
    }

    // Ajouter les entraînements
    if (entrainementsData?.entrainements) {
      Object.entries(entrainementsData.entrainements).forEach(([date, entrainements]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...entrainements);
      });
    }

    // Ajouter les plateaux
    if (plateauxData?.plateaux) {
      Object.entries(plateauxData.plateaux).forEach(([date, plateaux]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...plateaux);
      });
    }

    // Trier les événements par heure pour chaque date
    Object.keys(combined).forEach((date) => {
      const dateArray = combined[date];
      if (dateArray) {
        dateArray.sort((a, b) => {
          const timeA = 'time' in a ? a.time : '';
          const timeB = 'time' in b ? b.time : '';
          return timeA.localeCompare(timeB);
        });
      }
    });

    return combined;
  }, [matchesData, matchesAmicauxData, entrainementsData, plateauxData]);

  // Fonction pour filtrer les événements
  const filteredEvents = useMemo(() => {
    const filtered: Record<string, Event[]> = {};

    Object.entries(allEvents).forEach(([date, events]) => {
      const filteredForDate = events.filter((event) => {
        // Les filtres ne s'appliquent qu'aux matchs (officiels et amicaux)
        if ('localTeam' in event || 'competition' in event) {
          const match = event as Match;

          // Filtre par club
          if (filters.clubSearch) {
            const searchLower = filters.clubSearch.toLowerCase();
            const matchesClub =
              match.localTeam?.toLowerCase().includes(searchLower) ||
              match.awayTeam?.toLowerCase().includes(searchLower);
            if (!matchesClub) return false;
          }

          // Filtre par venue (seulement pour les matchs)
          if (filters.venue !== 'all' && match.venue && match.venue !== filters.venue) {
            return false;
          }

          // Filtre par arbitre AFP
          if (filters.arbitreAFPSearch) {
            const matchExtras = match.id ? allExtras[match.id] : null;
            if (!matchExtras) return false;

            const searchLower = filters.arbitreAFPSearch.toLowerCase();
            let hasMatchingArbitre = false;

            // Vérifier dans les arbitres AFP (tableau ou objet)
            if (Array.isArray(matchExtras.arbitreTouche)) {
              hasMatchingArbitre = matchExtras.arbitreTouche.some((arbitre) =>
                arbitre.nom.toLowerCase().includes(searchLower)
              );
            } else if (matchExtras.arbitreTouche && typeof matchExtras.arbitreTouche === 'object' && 'nom' in matchExtras.arbitreTouche) {
              const arbitreObj = matchExtras.arbitreTouche as { nom: string; numero?: string };
              hasMatchingArbitre = arbitreObj.nom.toLowerCase().includes(searchLower);
            }

            if (!hasMatchingArbitre) return false;
          }

          // Filtre par statut complété
          if (filters.completed !== 'all') {
            const matchExtras = match.id ? allExtras[match.id] : null;
            const isCompleted = matchExtras?.confirmed === true;
            
            if (filters.completed === 'completed' && !isCompleted) return false;
            if (filters.completed === 'not-completed' && isCompleted) return false;
          }
        }

        return true;
      });

      if (filteredForDate.length > 0) {
        filtered[date] = filteredForDate;
      }
    });

    return filtered;
  }, [allEvents, filters, allExtras]);

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={reload} onEventAdded={reloadAll} />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {isLoadingAll ? (
          <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
        ) : error ? (
          <ErrorMessage message={error} onRetry={reloadAll} />
        ) : (
          <>
            {matchesData?.matches && <MatchStats matches={matchesData.matches} />}
            <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Événements</h2>
              <ViewToggle view={view} onViewChange={setView} />
            </div>
            <MatchFilters filters={filters} onFiltersChange={setFilters} />
            <EventList events={filteredEvents} view={view} onEventUpdate={reloadAll} />
            {matchesData?.scrapedAt && (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                Dernière mise à jour: {formatDateFrench(matchesData.scrapedAt)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
