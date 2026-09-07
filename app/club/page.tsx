'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudRain, PencilRuler } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { ErrorMessage } from '@/app/components/ui/error-message';
import { ViewToggle, ViewMode } from '@/app/components/ui/view-toggle';
import { AddEventButton } from '@/app/components/ui/add-event-button';
import { ScraperButton } from '@/app/components/matches/ScraperButton';
import { DashboardSummary } from '@/app/components/layout/DashboardSummary';
import { EventList } from '@/app/components/events/EventList';
import { PublishPlanningControl } from '@/app/components/planning/PublishPlanningControl';
import { MatchFilters, MatchFilters as MatchFiltersType } from '@/app/components/matches/MatchFilters';
import { useMatches } from '@/app/hooks/useMatches';
import { useMatchesAmicaux } from '@/app/hooks/useMatchesAmicaux';
import { useEntrainements } from '@/app/hooks/useEntrainements';
import { usePlateaux } from '@/app/hooks/usePlateaux';
import { useAllMatchExtras } from '@/app/hooks/useAllMatchExtras';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatDateFrench } from '@/lib/utils/date';
import { eventWorkspaceHref } from '@/lib/planning/event-links';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { apiPost } from '@/lib/utils/api';
import { useAppSettings } from '@/hooks/useAppSettings';
import { roleLabelWithClub } from '@/lib/settings';

type Event = Match | Entrainement | Plateau;
type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

interface AttendanceItem {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  role: PlanningRole;
  personId: number | null;
  personNom: string;
  assignmentStatus: string;
}

const roleBaseLabels: Record<string, string> = {
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
  admin: 'Admin',
};

export default function ClubDashboardPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const router = useRouter();
  const { settings } = useAppSettings();
  const clubAbbr = settings.clubAbbreviation;
  const editable = canEdit(user?.roles);
  const { data, busyKey, action, reload: reloadDashboard } = useDashboardData(editable);

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
    eventType: 'all',
  });

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
      reloadDashboard(),
    ]);
    setWeekendRefreshKey((value) => value + 1);
  }, [reload, reloadAmicaux, reloadEntrainements, reloadPlateaux, reloadDashboard]);

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
        }

        return true;
      });

      if (filteredForDate.length > 0) filtered[date] = filteredForDate;
    });

    return filtered;
  }, [allEvents, filters, allExtras]);

  const markAttendance = (
    item: AttendanceItem,
    status: 'present' | 'excused' | 'absent' | 'replaced',
  ) => action(
    `attendance:${item.eventId}:${item.role}:${item.personId ?? item.personNom}`,
    () => apiPost('/api/planning/attendance', {
      eventType: item.eventType,
      eventId: item.eventId,
      role: item.role,
      personId: item.personId,
      personNom: item.personNom,
      status,
    }),
    'Présence enregistrée',
  );

  if (authLoading || !user || !canEdit(user.roles)) {
    return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-primary">Planning opérationnel</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tableau de bord</h1>
            {clubAbbr && <Badge variant="outline" className="uppercase">{clubAbbr}</Badge>}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Suivez le week-end et les points bloquants, parcourez tous les événements, puis publiez le planning.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <Button variant="outline" asChild>
            <Link href="/club/planning">
              <PencilRuler className="mr-2 h-4 w-4" />
              {data?.alerts.length ? `Corriger les ${data.alerts.length} alerte(s)` : 'Ouvrir la préparation'}
            </Link>
          </Button>
          <PublishPlanningControl context="dashboard" onPublished={reloadAll} />
        </div>
      </header>

      <DashboardSummary dashboard={data} matches={matchesData?.matches} refreshKey={weekendRefreshKey} />

      {data && data.weatherAlerts.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CloudRain className="h-4 w-4" /> Alertes météo du week-end <span className="text-xs font-normal text-muted-foreground">· indicatif</span></h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.weatherAlerts.map((item) => (
              <Card key={`${item.eventType}:${item.eventId}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">{item.date} · {item.time}</p></div>
                    <Badge variant={item.weather.severity === 'severe' ? 'destructive' : 'outline'}>{item.weather.severity === 'severe' ? 'Sévère' : 'Vigilance'}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm">{item.weather.alerts.join(' · ')}</p>
                  <Button className="mt-2" size="sm" variant="outline" asChild>
                    <Link href={eventWorkspaceHref(item.eventType, item.eventId, 'dashboard')}>Ouvrir l’événement</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!!data?.attendance.length && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Présences à clôturer <span className="text-xs font-normal text-muted-foreground">· {data.attendance.length}</span></h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.attendance.slice(0, 12).map((item) => (
              <Card key={`${item.eventId}:${item.role}:${item.personId ?? item.personNom}`}>
                <CardContent className="space-y-2 p-3">
                  <div><p className="text-sm font-medium">{item.personNom}</p><p className="text-xs text-muted-foreground">{roleLabelWithClub(roleBaseLabels[item.role] ?? item.role, clubAbbr)} · {item.title} · {item.date} {item.time}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => markAttendance(item, 'present')} disabled={busyKey !== null}>Présent</Button>
                    <Button size="sm" variant="outline" onClick={() => markAttendance(item, 'excused')} disabled={busyKey !== null}>Excusé</Button>
                    <Button size="sm" variant="destructive" onClick={() => markAttendance(item, 'absent')} disabled={busyKey !== null}>Absent</Button>
                    <Button size="sm" variant="outline" onClick={() => markAttendance(item, 'replaced')} disabled={busyKey !== null}>Remplacé</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section id="tous-les-evenements" className="scroll-mt-24 space-y-3" aria-labelledby="all-events-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="all-events-heading" className="text-lg font-bold sm:text-xl">Tous les événements</h2>
          <div className="flex items-center gap-2 sm:gap-3">
            {editable && <ScraperButton onScrapeComplete={reloadAll} />}
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
