'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/app/components/ui/badge';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { ErrorMessage } from '@/app/components/ui/error-message';
import { ViewToggle, ViewMode } from '@/app/components/ui/view-toggle';
import { ScraperButton } from '@/app/components/matches/ScraperButton';
import { EventList } from '@/app/components/events/EventList';
import { useMatches } from '@/app/hooks/useMatches';
import { useMatchesAmicaux } from '@/app/hooks/useMatchesAmicaux';
import { useEntrainements } from '@/app/hooks/useEntrainements';
import { usePlateaux } from '@/app/hooks/usePlateaux';
import { formatDateFrench } from '@/lib/utils/date';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { useAppSettings } from '@/hooks/useAppSettings';

type Event = Match | Entrainement | Plateau;

export default function ClubDashboardPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const router = useRouter();
  const { settings } = useAppSettings();
  const clubAbbr = settings.clubAbbreviation;
  const editable = canEdit(user?.roles);

  const { matchesData, isLoading, error, reload } = useMatches();
  const { matchesData: matchesAmicauxData, reload: reloadAmicaux } = useMatchesAmicaux();
  const { data: entrainementsData, reload: reloadEntrainements } = useEntrainements();
  const { data: plateauxData, reload: reloadPlateaux } = usePlateaux();
  const [view, setView] = useState<ViewMode>('card');

  useEffect(() => {
    if (!authLoading && user && !canEdit(user.roles)) router.replace('/mon-planning');
  }, [authLoading, user, router]);

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

  if (authLoading || !user || !canEdit(user.roles)) {
    return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-primary">Consultation</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Événements du club</h1>
            {clubAbbr && <Badge variant="outline" className="uppercase">{clubAbbr}</Badge>}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Parcourez tous les événements et actualisez-les depuis le site officiel. La préparation
            du planning, la correction des alertes et la publication se font dans
            « Préparation du planning ».
          </p>
        </div>
        {editable && <ScraperButton onScrapeComplete={reloadAll} />}
      </header>

      <section id="tous-les-evenements" className="scroll-mt-24 space-y-3" aria-labelledby="all-events-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="all-events-heading" className="text-lg font-bold sm:text-xl">Tous les événements</h2>
          <ViewToggle view={view} onViewChange={setView} showCalendar={false} />
        </div>

        {isLoadingAll ? (
          <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
        ) : error ? (
          <ErrorMessage message={error} onRetry={reloadAll} />
        ) : (
          <>
            <EventList events={allEvents} view={view} onEventUpdate={reloadAll} readOnly origin="dashboard" />
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
