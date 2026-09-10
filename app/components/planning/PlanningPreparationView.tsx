"use client";

import { useState, useMemo, useCallback } from "react";
import { Calendar } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useMatches } from "@/app/hooks/useMatches";
import { useMatchesAmicaux } from "@/app/hooks/useMatchesAmicaux";
import { useEntrainements } from "@/app/hooks/useEntrainements";
import { usePlateaux } from "@/app/hooks/usePlateaux";
import { useAllMatchExtras } from "@/app/hooks/useAllMatchExtras";
import { useDashboardData, type AlertItem } from "@/hooks/useDashboardData";
import { useCurrentUser } from "@/app/hooks/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";
import { EventsPanel } from "@/app/components/planning/EventsPanel";
import { OfficielsPanel } from "@/app/components/planning/OfficielsPanel";
import { PlanningControlList } from "@/app/components/planning/PlanningControlList";
import { PublishPlanningControl, type PublicationBlocker } from "@/app/components/planning/PublishPlanningControl";
import { Badge } from "@/app/components/ui/badge";
import { LoadingSpinner } from "@/app/components/ui/loading-spinner";
import { ErrorMessage } from "@/app/components/ui/error-message";
import { PageContainer, PageHeader, SectionCard, StatCard } from "@/app/components/layout/page-primitives";
import { useAppSettings } from "@/app/hooks/useAppSettings";
import { Match, Entrainement, Plateau } from "@/types/match";
import { ContactOfficiel } from "@/app/hooks/useMatchExtras";
import { apiPut, apiPost } from "@/lib/utils/api";
import { toast } from "sonner";
import { getOfficielAvailabilityStatus } from "@/lib/utils/officiel-availability";
import { checkPersonConflict, checkLocationConflict } from "@/lib/utils/assignment-conflicts";

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

  const [, setActiveId] = useState<string | null>(null);
  const [activeOfficiel, setActiveOfficiel] = useState<{ nom: string; telephone?: string } | null>(null);
  const [publicationBlockers, setPublicationBlockers] = useState<PublicationBlocker[]>([]);
  const [publicationRefresh, setPublicationRefresh] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

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

  const controlAlerts = useMemo(() => dashboard?.alerts ?? [], [dashboard?.alerts]);

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const activeData = event.active.data.current;
    if (activeData?.type === "officiel" && activeData.officiel) {
      setActiveOfficiel(activeData.officiel);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOfficiel(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== "officiel" || !activeData.officiel) {
      return;
    }

    if (!overData?.eventId || !overData?.role) {
      return;
    }

    const officiel = activeData.officiel;
    const eventId = overData.eventId as string;
    const role = overData.role as "arbitre" | "encadrant" | "accompagnateur";
    const eventType = overData.eventType as "match" | "entrainement" | "plateau";

    let targetEvent: Event | null = null;
    for (const date in allEvents) {
      const events = allEvents[date];
      if (!events) continue;
      const found = events.find((e) => e.id === eventId);
      if (found) {
        targetEvent = found;
        break;
      }
    }

    if (!targetEvent) {
      toast.error("Événement non trouvé");
      return;
    }

    const contact: ContactOfficiel = {
      nom: officiel.nom,
      numero: officiel.telephone || "",
    };

    const availability = getOfficielAvailabilityStatus(officiel, targetEvent.date, targetEvent.time);
    if (availability.unavailable) {
      toast.error(availability.message || "Cet officiel est indisponible pour cet événement.");
      return;
    }

    const flatEvents = Object.values(allEvents)
      .flat()
      .filter((e) => e.id !== targetEvent!.id);
    const personConflict = checkPersonConflict(officiel.nom, role, targetEvent, flatEvents, allExtras);
    if (personConflict.conflict) {
      toast.warning(personConflict.message);
    }
    const locationConflict = checkLocationConflict(targetEvent, flatEvents);
    if (locationConflict.conflict) {
      toast.warning(locationConflict.message);
    }

    try {
      if (eventType === "match") {
        let currentExtras = allExtras[eventId] || null;

        if (!currentExtras) {
          currentExtras = await fetch(`/api/matches/${eventId}`)
            .then((res) => res.json())
            .catch(() => null);
        }

        const normalizedExtras = {
          id: eventId,
          confirmed: currentExtras?.confirmed || false,
          arbitreTouche: Array.isArray(currentExtras?.arbitreTouche)
            ? currentExtras.arbitreTouche
            : currentExtras?.arbitreTouche
              ? [currentExtras.arbitreTouche]
              : [],
          contactEncadrants: Array.isArray(currentExtras?.contactEncadrants)
            ? currentExtras.contactEncadrants
            : currentExtras?.contactEncadrants
              ? [currentExtras.contactEncadrants]
              : [],
          contactAccompagnateur: Array.isArray(currentExtras?.contactAccompagnateur)
            ? currentExtras.contactAccompagnateur
            : currentExtras?.contactAccompagnateur
              ? [currentExtras.contactAccompagnateur]
              : [],
        };

        const updatedExtras = { ...normalizedExtras };

        if (role === "arbitre") {
          const existing = updatedExtras.arbitreTouche || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.arbitreTouche = [...existing, contact];
          }
        } else if (role === "encadrant") {
          const existing = updatedExtras.contactEncadrants || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.contactEncadrants = [...existing, contact];
          }
        } else if (role === "accompagnateur") {
          const existing = updatedExtras.contactAccompagnateur || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.contactAccompagnateur = [...existing, contact];
          }
        }

        await apiPut(`/api/matches/${eventId}`, updatedExtras);
        await reloadAllExtras();
      } else if (eventType === "entrainement" || eventType === "plateau") {
        const currentEncadrants = (targetEvent as Entrainement | Plateau).encadrants || [];
        if (!currentEncadrants.some((c) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
          const updatedEvent = {
            ...targetEvent,
            encadrants: [...currentEncadrants, contact],
          };
          await apiPut(eventType === "entrainement" ? "/api/entrainements" : "/api/plateaux", updatedEvent);
        }
      }

      toast.success("Officiel affecté avec succès");
      reloadAll();
    } catch (error) {
      console.error("Error assigning officiel:", error);
      toast.error("Erreur lors de l'affectation de l'officiel");
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveOfficiel(null);
  };

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

      {editable && (
        <PlanningControlList
          alerts={controlAlerts}
          onRemind={remind}
          actionBusy={busyKey !== null}
        />
      )}

      {isLoadingAll ? (
        <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
      ) : matchesError ? (
        <ErrorMessage message={matchesError} onRetry={reloadAll} />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:h-[calc(100dvh-350px)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,350px)_minmax(0,1fr)]">
            <OfficielsPanel className="min-w-0 lg:h-full" events={allEvents} allExtras={allExtras} onEventUpdate={reloadAll} />
            <EventsPanel
              events={allEvents}
              allExtras={allExtras}
              onEventUpdate={reloadAll}
              className="min-w-0 lg:h-full"
              alerts={alertsByKey}
              publicationBlockers={blockersByEvent}
              onRemind={remind}
              actionBusy={busyKey !== null}
            />
          </div>

          <DragOverlay>
            {activeOfficiel ? (
              <div className="rounded-lg border-2 border-primary bg-card p-3 opacity-90 shadow-lg">
                <p className="text-sm font-medium">{activeOfficiel.nom}</p>
                {activeOfficiel.telephone && <p className="text-xs text-muted-foreground">{activeOfficiel.telephone}</p>}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </PageContainer>
  );
}
