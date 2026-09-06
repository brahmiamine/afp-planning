'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CloudRain,
  Send,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { ErrorMessage } from '@/app/components/ui/error-message';
import { ViewToggle, ViewMode } from '@/app/components/ui/view-toggle';
import { AddEventButton } from '@/app/components/ui/add-event-button';
import { ScraperButton } from '@/app/components/matches/ScraperButton';
import { MatchStats } from '@/app/components/layout/MatchStats';
import { EventList } from '@/app/components/events/EventList';
import { WeekendEventsOverview } from '@/app/components/events/WeekendEventsOverview';
import { MatchFilters, MatchFilters as MatchFiltersType } from '@/app/components/matches/MatchFilters';
import { useMatches } from '@/app/hooks/useMatches';
import { useMatchesAmicaux } from '@/app/hooks/useMatchesAmicaux';
import { useEntrainements } from '@/app/hooks/useEntrainements';
import { usePlateaux } from '@/app/hooks/usePlateaux';
import { useAllMatchExtras } from '@/app/hooks/useAllMatchExtras';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatDateFrench } from '@/lib/utils/date';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { apiPost } from '@/lib/utils/api';

type Event = Match | Entrainement | Plateau;
type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

interface AlertItem {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  planningStatus: 'draft' | 'published' | 'modified' | 'cancelled';
  missingRoles: PlanningRole[];
  replacementRoles: PlanningRole[];
  pending: number;
  declined: number;
  remindersDue: number;
}

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

const roleLabels: Record<string, string> = {
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
  admin: 'Admin',
};

function statusBadge(status: AlertItem['planningStatus']) {
  if (status === 'draft') return <Badge variant="secondary">Brouillon</Badge>;
  if (status === 'modified') return <Badge variant="outline">Modifié</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">Annulé</Badge>;
  return <Badge>Publié</Badge>;
}

export default function ClubDashboardPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const router = useRouter();
  const editable = canEdit(user?.roles);
  const { data, loading: dashboardLoading, busyKey, action, reload: reloadDashboard } = useDashboardData(editable);

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

  const publicationAction = (
    item: AlertItem,
    actionName: 'publish' | 'draft' | 'cancel' | 'reopen',
  ) => action(
    `publication:${item.eventType}:${item.eventId}`,
    () => apiPost('/api/planning/publication', {
      eventType: item.eventType,
      eventId: item.eventId,
      action: actionName,
    }),
    actionName === 'publish' ? 'Planning publié' : 'Statut du planning mis à jour',
  );

  const autoAssign = (item: AlertItem, role: PlanningRole) => action(
    `assign:${item.eventId}:${role}`,
    () => apiPost('/api/planning/auto-assign', {
      eventType: item.eventType,
      eventId: item.eventId,
      role,
    }),
    `${roleLabels[role]} affecté automatiquement`,
  );

  const remind = (item: AlertItem) => action(
    `remind:${item.eventId}`,
    () => apiPost('/api/planning/reminders', {
      eventType: item.eventType,
      eventId: item.eventId,
    }),
    'Relance(s) envoyée(s)',
  );

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
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Planning opérationnel</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tableau de bord</h1>
        <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
          Pilotez les événements à venir, la préparation du week-end et les points qui demandent une action, depuis un seul espace.
        </p>
      </header>

      <WeekendEventsOverview refreshKey={weekendRefreshKey} />

      {data && data.weatherAlerts.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><CloudRain className="h-5 w-5" /> Alertes météo du week-end</h2>
            <p className="text-sm text-muted-foreground">Informations indicatives ; aucune modification automatique du planning.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.weatherAlerts.map((item) => (
              <Card key={`${item.eventType}:${item.eventId}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{item.title}</p><p className="text-sm text-muted-foreground">{item.date} · {item.time}</p></div>
                    <Badge variant={item.weather.severity === 'severe' ? 'destructive' : 'outline'}>{item.weather.severity === 'severe' ? 'Sévère' : 'Vigilance'}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{item.weather.alerts.join(' · ')}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold">Priorités opérationnelles</h2><p className="text-sm text-muted-foreground">Publication, postes manquants, refus, remplacements et relances.</p></div>
          {dashboardLoading && !data ? null : <Badge variant={data?.alerts.length ? 'destructive' : 'outline'}>{data?.alerts.length ?? 0} alerte(s)</Badge>}
        </div>
        {dashboardLoading && !data ? (
          <LoadingSpinner size={36} text="Analyse du planning..." className="py-10" />
        ) : !data?.alerts.length ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-10 text-emerald-600"><CheckCircle2 className="h-5 w-5" /> Aucun point bloquant.</CardContent></Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.alerts.map((item) => (
              <Card key={`${item.eventType}:${item.eventId}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><CardTitle className="text-base">{item.title}</CardTitle><p className="text-sm text-muted-foreground">{item.date} · {item.time}</p></div>
                    {statusBadge(item.planningStatus)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.missingRoles.map((role) => <Badge key={`m-${role}`} variant="destructive">Manque {roleLabels[role]}</Badge>)}
                    {item.replacementRoles.map((role) => <Badge key={`r-${role}`} variant="destructive">Remplacer {roleLabels[role]}</Badge>)}
                    {!!item.pending && <Badge variant="outline">{item.pending} en attente</Badge>}
                    {!!item.declined && <Badge variant="destructive">{item.declined} refus</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.planningStatus === 'draft' && <Button size="sm" onClick={() => publicationAction(item, 'publish')} disabled={busyKey !== null}>Publier</Button>}
                    {item.planningStatus === 'modified' && <Button size="sm" onClick={() => publicationAction(item, 'publish')} disabled={busyKey !== null}>Republier</Button>}
                    {(item.planningStatus === 'published' || item.planningStatus === 'modified') && <><Button size="sm" variant="outline" onClick={() => publicationAction(item, 'draft')} disabled={busyKey !== null}>Brouillon</Button><Button size="sm" variant="destructive" onClick={() => publicationAction(item, 'cancel')} disabled={busyKey !== null}>Annuler</Button></>}
                    {item.planningStatus === 'cancelled' && <Button size="sm" variant="outline" onClick={() => publicationAction(item, 'reopen')} disabled={busyKey !== null}>Rouvrir</Button>}
                    {item.planningStatus !== 'cancelled' && [...new Set([...item.missingRoles, ...item.replacementRoles])].map((role) => <Button key={role} size="sm" variant="outline" onClick={() => autoAssign(item, role)} disabled={busyKey !== null}><Sparkles className="mr-1 h-3.5 w-3.5" /> Auto-affecter {roleLabels[role]}</Button>)}
                    {!!item.pending && (item.planningStatus === 'published' || item.planningStatus === 'modified') && <Button size="sm" variant="outline" onClick={() => remind(item)} disabled={busyKey !== null}><Send className="mr-1 h-3.5 w-3.5" /> Relancer</Button>}
                    <Button size="sm" variant="ghost" asChild><Link href={`/club/evenements/${item.eventType}/${encodeURIComponent(item.eventId)}`}>Détails</Link></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {!!data?.attendance.length && (
        <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">Présences à clôturer</h2><p className="text-sm text-muted-foreground">Événements terminés récemment sans présence enregistrée.</p></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.attendance.slice(0, 12).map((item) => (
              <Card key={`${item.eventId}:${item.role}:${item.personId ?? item.personNom}`}>
                <CardContent className="space-y-3 p-4">
                  <div><p className="font-medium">{item.personNom}</p><p className="text-sm text-muted-foreground">{roleLabels[item.role]} · {item.title} · {item.date} {item.time}</p></div>
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

      <section id="tous-les-evenements" className="scroll-mt-24 space-y-4" aria-labelledby="all-events-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="all-events-heading" className="text-lg font-bold sm:text-xl">Tous les événements</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Matchs officiels et amicaux, entraînements et plateaux avec filtres et vues adaptées.
            </p>
          </div>
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
