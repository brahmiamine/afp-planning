'use client';

import { useMatches } from './hooks/useMatches';
import { Header } from './components/layout/Header';
import { StatsSection } from './components/layout/StatsSection';
import { MatchList } from './components/matches/MatchList';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { ErrorMessage } from './components/ui/ErrorMessage';
import { formatDateFrench } from './lib/utils/date';

export default function Home() {
  const { matchesData, isLoading, error, reload } = useMatches();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Header club={matchesData?.club} onScrapeComplete={reload} />

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <LoadingSpinner size={48} text="Chargement des matchs..." className="py-20" />
        ) : error ? (
          <ErrorMessage message={error} onRetry={reload} />
        ) : matchesData && matchesData.matches ? (
          <>
            <StatsSection matches={matchesData.matches} />
            <MatchList matches={matchesData.matches} onMatchUpdate={reload} />
            {matchesData.scrapedAt && (
              <div className="mt-8 text-center text-sm text-gray-500">
                Dernière mise à jour: {formatDateFrench(matchesData.scrapedAt)}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-600 text-lg mb-4">Aucun match disponible</p>
            <p className="text-gray-500 text-sm">Lancez le scraping pour extraire les matchs</p>
          </div>
        )}
      </main>
    </div>
  );
}
