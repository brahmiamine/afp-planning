'use client';

import { useMatches } from './hooks/useMatches';
import { Header } from './components/layout/Header';
import { StatsSection } from './components/layout/StatsSection';
import { MatchList } from './components/matches/MatchList';
import { LoadingSpinner } from './components/ui/loading-spinner';
import { ErrorMessage } from './components/ui/error-message';
import { formatDateFrench } from './lib/utils/date';

export default function Home() {
  const { matchesData, isLoading, error, reload } = useMatches();

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
            <MatchList matches={matchesData.matches} onMatchUpdate={reload} />
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
