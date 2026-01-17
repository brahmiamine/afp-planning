'use client';

import { useState, useMemo } from 'react';
import { useMatches } from './hooks/useMatches';
import { Header } from './components/layout/Header';
import { StatsSection } from './components/layout/StatsSection';
import { MatchList } from './components/matches/MatchList';
import { MatchFilters, MatchFilters as MatchFiltersType } from './components/matches/MatchFilters';
import { LoadingSpinner } from './components/ui/loading-spinner';
import { ErrorMessage } from './components/ui/error-message';
import { ViewToggle, ViewMode } from './components/ui/view-toggle';
import { formatDateFrench } from './lib/utils/date';
import { Match } from '@/types/match';
import { useAllMatchExtras } from './hooks/useAllMatchExtras';

export default function Home() {
  const { matchesData, isLoading, error, reload } = useMatches();
  const { allExtras } = useAllMatchExtras();
  const [view, setView] = useState<ViewMode>('card');
  const [filters, setFilters] = useState<MatchFiltersType>({
    clubSearch: '',
    arbitreAFPSearch: '',
    venue: 'all',
    completed: 'all',
  });

  // Fonction pour filtrer les matchs
  const filteredMatches = useMemo(() => {
    if (!matchesData?.matches) return {};

    const filtered: Record<string, Match[]> = {};

    Object.entries(matchesData.matches).forEach(([date, matches]) => {
      const filteredForDate = matches.filter((match) => {
        // Filtre par club
        if (filters.clubSearch) {
          const searchLower = filters.clubSearch.toLowerCase();
          const matchesClub =
            match.localTeam.toLowerCase().includes(searchLower) ||
            match.awayTeam.toLowerCase().includes(searchLower);
          if (!matchesClub) return false;
        }

        // Filtre par venue
        if (filters.venue !== 'all' && match.venue !== filters.venue) {
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

        return true;
      });

      if (filteredForDate.length > 0) {
        filtered[date] = filteredForDate;
      }
    });

    return filtered;
  }, [matchesData?.matches, filters, allExtras]);

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={reload} />

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <LoadingSpinner size={48} text="Chargement des matchs..." className="py-20" />
        ) : error ? (
          <ErrorMessage message={error} onRetry={reload} />
        ) : matchesData && matchesData.matches ? (
          <>
            <StatsSection matches={matchesData.matches} />
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">Matchs</h2>
              <ViewToggle view={view} onViewChange={setView} />
            </div>
            <MatchFilters filters={filters} onFiltersChange={setFilters} />
            <MatchList matches={filteredMatches} view={view} onMatchUpdate={reload} />
            {matchesData.scrapedAt && (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                Dernière mise à jour: {formatDateFrench(matchesData.scrapedAt)}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-foreground text-lg mb-4">Aucun match disponible</p>
            <p className="text-muted-foreground text-sm">Lancez le scraping pour extraire les matchs</p>
          </div>
        )}
      </main>
    </div>
  );
}
