"use client";

import { useState, useMemo, useCallback } from "react";
import { Calendar } from "lucide-react";
import { useMatches } from "@/app/hooks/useMatches";
import { useMatchesAmicaux } from "@/app/hooks/useMatchesAmicaux";
import { useEntrainements } from "@/app/hooks/useEntrainements";
import { usePlateaux } from "@/app/hooks/usePlateaux";
import { useAllMatchExtras } from "@/app/hooks/useAllMatchExtras";
import { useDashboardData, type AlertItem } from "@/hooks/useDashboardData";
import { useCurrentUser } from "@/app/hooks/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";
import { EventsPanel } from "@/app/components/planning/EventsPanel";
import { PublishPlanningControl, type PublicationBlocker } from "@/app/components/planning/PublishPlanningControl";
import { Badge } from "@/app/components/ui/badge";
import { LoadingSpinner } from "@/app/components/ui/loading-spinner";
import { ErrorMessage } from "@/app/components/ui/error-message";
import { PageContainer, PageHeader, SectionCard, StatCard } from "@/app/components/layout/page-primitives";
import { useAppSettings } from "@/app/hooks/useAppSettings";
import { Match, Entrainement, Plateau } from "@/types/match";
import { apiPost } from "@/lib/utils/api";

type Event = Match | Entrainement | Plateau;

export function PlanningPreparationView() {
  const { user } = useCurrentUser();
  const { settings } = useAppSettings();
  const clubAbbr = settings.clubAbbreviation;
  const editable = canEdit(user?.accessRole);
  const { matchesData, isLoading: isLoadingMatches, error: matchesError, reload: reloadMatches } = useMatches();
  const { matchesData: matchesAmicauxData, reload: reloadAmicaux } = useMatchesAmicaux();
  const { data: entrainementsData, reload: reloadEntrainements } = useEntrainements();
  const { data: plateauxData, reload: reloadPlateaux } = usePlateaux();
  const { allExtras, reload: reloadAllExtras } = useAllMatchExtras();
  const { data: dashboard, busyKey, action, reload: reloadDashboard } = useDashboardData(editable);

  const [publicationBlockers, setPublicationBlockers] = useState<PublicationBlocker[]>([]);
  const [publicationRefresh, setPublicationRefresh] = useState(0);

  const isLoadingAll = isLoadingMatches || matchesAmicauxData === null || entrainementsData === null || plateauxData === null;

  const reloadEventSources = useCallback(() => {
    reloadMatches();
    reloadAmicaux();
    reloadEntrainements();
    reloadPlateaux();
    reloadAllExtras();
  }, [reloadMatches, reloadAmicaux, reloadEntrainements, reloadPlateaux, reloadAllExtras]);

  const reloadAll = useCallback(() => {
    reloadEventSources();
    reloadDashboard();
    setPublicationRefresh((n) => n + 1);
  }, [reloadEventSources, reloadDashboard]);

  const alertsByKey = useMemo(() => {
    const map: Record<string, AlertItem> = {};
    for (const item of dashboard?.alerts ?? []) {
      map[`${item.eventType}:${item.eventId}`] = item;
    }
    return map;
  }, [dashboard?.alerts]);

  const blockersByEvent = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const blocker of publicationBlockers) {
      if (!blocker.eventType || !blocker.eventId) continue;
      const key = `${blocker.eventType}:${blocker.eventId}`;
      (map[key] ??= []).push(blocker.detail ?? blocker.message);
    }
    return map;
  }, [publicationBlockers]);

  const remind = useCallback(async (item: AlertItem) => {
    await action(
      `remind:${item.eventId}`,
      () => apiPost("/api/planning/reminders", { eventType: item.eventType, eventId: item.eventId }),
      "Relance(s) envoyée(s)",
    );
    reloadEventSources();
  }, [action, reloadEventSources]);

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
      const dateArray = combined[date];
      if (dateArray) {
        dateArray.sort((a, b) => {
          const timeA = "time" in a ? a.time : "";
          const timeB = "time" in b ? b.time : "";
          return timeA.localeCompare(timeB);
        });
      }
    });

    return combined;
  }, [matchesData, matchesAmicauxData, entrainementsData, plateauxData]);

  const statCards = dashboard
    ? [
        ["Événements", dashboard.totals.events, "neutral" as const],
        ["Complets", dashboard.totals.complete, "success" as const],
        ["À traiter", dashboard.totals.attention, dashboard.totals.attention > 0 ? ("danger" as const) : ("neutral" as const)],
        ["Rôles manquants", dashboard.totals.missingRoles, dashboard.totals.missingRoles > 0 ? ("danger" as const) : ("neutral" as const)],
        ["En attente", dashboard.totals.pending, "neutral" as const],
        ["Refus", dashboard.totals.declined, dashboard.totals.declined > 0 ? ("danger" as const) : ("neutral" as const)],
      ]
    : [];

  return (
    <PageContainer className="min-w-0 max-w-full overflow-x-hidden">
      <PageHeader
        icon={<Calendar />}
        title={(
          <span className="inline-flex flex-wrap items-center gap-2">
            Construire et modifier le planning
            {clubAbbr && <Badge variant="outline" className="uppercase">{clubAbbr}</Badge>}
          </span>
        )}
        description="Ajoutez les événements, affectez les officiels, corrigez les alertes puis publiez le planning."
      />

      <SectionCard title="Publication du planning" flush contentClassName="p-4 sm:p-6">
        <PublishPlanningControl
          onPublished={reloadAll}
          onBlockersChange={setPublicationBlockers}
          refreshSignal={publicationRefresh}
        />
      </SectionCard>

      {dashboard && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map(([label, value, tone]) => (
            <StatCard
              key={String(label)}
              label={label}
              value={value}
              className={tone === "danger" ? "[&_p:last-child]:text-destructive" : tone === "success" ? "[&_p:last-child]:text-emerald-600 dark:[&_p:last-child]:text-emerald-400" : undefined}
            />
          ))}
        </div>
      )}

      {isLoadingAll ? (
        <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
      ) : matchesError ? (
        <ErrorMessage message={matchesError} onRetry={reloadAll} />
      ) : (
        <EventsPanel
          events={allEvents}
          allExtras={allExtras}
          onEventUpdate={reloadAll}
          className="min-w-0"
          alerts={alertsByKey}
          publicationBlockers={blockersByEvent}
          onRemind={remind}
          actionBusy={busyKey !== null}
        />
      )}
    </PageContainer>
  );
}
