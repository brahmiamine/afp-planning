'use client';

import { useState, useMemo, useCallback } from 'react';
import { useMatches } from '@/app/hooks/useMatches';
import { useMatchesAmicaux } from '@/app/hooks/useMatchesAmicaux';
import { useEntrainements } from '@/app/hooks/useEntrainements';
import { usePlateaux } from '@/app/hooks/usePlateaux';
import { MatchStats } from '@/app/components/layout/MatchStats';
import { EventList } from '@/app/components/events/EventList';
import { WeekendEventsOverview } from '@/app/components/events/WeekendEventsOverview';
import { MatchFilters, MatchFilters as MatchFiltersType } from '@/app/components/matches/MatchFilters';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { ErrorMessage } from '@/app/components/ui/error-message';
import { ViewToggle, ViewMode } from '@/app/components/ui/view-toggle';
import { formatDateFrench } from '@/lib/utils/date';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useAllMatchExtras } from '@/app/hooks/useAllMatchExtras';
import { AddEventButton } from '@/app/components/ui/add-event-button';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';

type Event = Match | Entrainement | Plateau;

export default function EventsPage() {
  const { user } = useCurrentUser();
  const editable = canEdit(user?.roles);
  const { matchesData, isLoading, error, reload } = useMatches();
  const { matchesData: matchesAmicauxData, reload: reloadAmicaux } = useMatchesAmicaux();
  const { data: entrainementsData, reload: reloadEntrainements } = useEntrainements();
  const { data: plateauxData, reload: reloadPlateaux } = usePlateaux();
  const { allExtras } = useAllMatchExtras();
  const [view, setView] = useState<ViewMode>('card');
  const [weekendRefreshKey, setWeekendRefreshKey] = useState(0);
  const [filters, setFilters] = useState<MatchFiltersType>({
    clubSearch: '',
    arbitreAFPSearch: '',
    venue: 'all',
    completed: 'all',
    eventType: 'all',
  });

  const isLoadingAll = isLoading
    || matchesAmicauxData === null
    || entrainementsData === null
    || plateauxData === null;

  const reloadAll = useCallback(async () => {
    await Promise.all([
      reload(),
      reloadAmicaux(),
      reloadEntrainements(),
      reloadPlateaux(),
    ]);
    setWeekendRefreshKey((value) => value + 1);
  }, [reload, reloadAmicaux, reloadEntrainements, reloadPlateaux]);

  const allEvents = useMemo(() => {
    const combined: Record<string, Event[]> = {};

    if (matchesData?.matches) {
      Object.entries(matchesData.matches).forEach(([date, matches]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...matches);
      });
    }

    if (matchesAmicauxData?.matches) {
      Object.entries(matchesAmicauxData.matches).forEach(([date, matches]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...matches);
      });
    }

    if (entrainementsData?.entrainements) {
      Object.entries(entrainementsData.entrainements).forEach(([date, entrainements]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...entrainements);
      });
    }

    if (plateauxData?.plateaux) {
      Object.entries(plateauxData.plateaux).forEach(([date, plateaux]) => {
        if (!combined[date]) combined[date] = [];
        combined[date].push(...plateaux);
      });
    }

    Object.keys(combined).forEach((date) => {
      combined[date]?.sort((a, b) => {
        const timeA = 'time' in a ? a.time : '';
        const timeB = 'time' in b ? b.time : '';
        return timeA.localeCompare(timeB);
      });
    });

    return combined;
  }, [matchesData, matchesAmicauxData, entrainementsData, plateauxData]);

  const filteredEvents = useMemo(() => {
    const filtered: Record<string, Event[]> = {};

    Object.entries(allEvents).forEach(([date, events]) => {
      const filteredForDate = events.filter((event) => {
        if (filters.eventType !== 'all') {
          let eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';

          if ('type' in event && event.type) {
            eventType = event.type;
          } else if ('localTeam' in event || 'competition' in event) {
            const match = event as Match;
            eventType = match.type === 'amical' ? 'amical' : 'officiel';
          } else if ('lieu' in event) {
            const simpleEvent = event as Entrainement | Plateau;
            eventType = simpleEvent.type;
          } else {
            return false;
          }

          const filterType = filters.eventType as 'officiel' | 'amical' | 'entrainement' | 'plateau';
          if (eventType !== filterType) return false;
        }

        if ('localTeam' in event || 'competition' in event) {
          const match = event as Match;

          if (filters.clubSearch) {
            const searchLower = filters.clubSearch.toLowerCase();
            const matchesClub = match.localTeam?.toLowerCase().includes(searchLower)
              || match.awayTeam?.toLowerCase().includes(searchLower);
            if (!matchesClub) return false;
          }

          if (filters.venue !== 'all' && match.venue && match.venue !== filters.venue) {
            return false;
          }

          if (filters.arbitreAFPSearch) {
            const matchExtras = match.id ? allExtras[match.id] : null;
            if (!matchExtras) return false;

            const searchLower = filters.arbitreAFPSearch.toLowerCase();
            let hasMatchingArbitre = false;

            if (Array.isArray(matchExtras.arbitreTouche)) {
              hasMatchingArbitre = matchExtras.arbitreTouche.some((arbitre) =>
                arbitre.nom.toLowerCase().includes(searchLower),
              );
            } else if (
              matchExtras.arbitreTouche
              && typeof matchExtras.arbitreTouche === 'object'
              && 'nom' in matchExtras.arbitreTouche
            ) {
              const arbitreObj = matchExtras.arbitreTouche as { nom: string; numero?: string };
              hasMatchingArbitre = arbitreObj.nom.toLowerCase().includes(searchLower);
            }

            if (!hasMatchingArbitre) return false;
          }

          if (filters.completed !== 'all') {
            const matchExtras = match.id ? allExtras[match.id] : null;
            const isCompleted = matchExtras?.confirmed === true;

            if (filters.completed === 'completed' && !isCompleted) return false;
            if (filters.completed === 'not-completed' && isCompleted) return false;
          }
        }

        return true;
      });

      if (filteredForDate.length > 0) filtered[date] = filteredForDate;
    });

    return filtered;
  }, [allEvents, filters, allExtras]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Planning opérationnel</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Événements & week-end</h1>
        <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
          Pilotez les événements à venir, contrôlez la préparation du week-end et accédez à tous les détails depuis un seul espace.
        </p>
      </header>

      <WeekendEventsOverview refreshKey={weekendRefreshKey} />

      <section id="tous-les-evenements" className="scroll-mt-24 space-y-4" aria-labelledby="all-events-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="all-events-heading" className="text-lg font-bold sm:text-xl">Tous les événements</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Matchs officiels et amicaux, entraînements et plateaux avec filtres et vues adaptées.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {editable && <AddEventButton onEventAdded={reloadAll} />}
            <ViewToggle view={view} onViewChange={setView} />
          </div>
        </div>

        {isLoadingAll ? (
          <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
        ) : error ? (
          <ErrorMessage message={error} onRetry={reloadAll} />
        ) : (
          <>
            {matchesData?.matches && <MatchStats matches={matchesData.matches} />}
            <MatchFilters filters={filters} onFiltersChange={setFilters} />
            <EventList events={filteredEvents} view={view} onEventUpdate={reloadAll} />
            {matchesData?.scrapedAt && (
              <div className="pt-4 text-center text-sm text-muted-foreground">
                Dernière mise à jour : {formatDateFrench(matchesData.scrapedAt)}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
