"use client";

import { useState, useMemo, useCallback } from "react";
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
import { PublishPlanningControl } from "@/app/components/planning/PublishPlanningControl";
import { ScraperButton } from "@/app/components/matches/ScraperButton";
import { MatchFilters, MatchFilters as MatchFiltersType } from "@/app/components/matches/MatchFilters";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { LoadingSpinner } from "@/app/components/ui/loading-spinner";
import { ErrorMessage } from "@/app/components/ui/error-message";
import { useAppSettings } from "@/app/hooks/useAppSettings";
import { Match, Entrainement, Plateau } from "@/types/match";
import { ContactOfficiel } from "@/app/hooks/useMatchExtras";
import { apiPut, apiPost } from "@/lib/utils/api";
import { toast } from "sonner";
import { getOfficielAvailabilityStatus } from "@/lib/utils/officiel-availability";
import { checkPersonConflict, checkLocationConflict } from "@/lib/utils/assignment-conflicts";

type Event = Match | Entrainement | Plateau;
type PlanningRole = "arbitre" | "encadrant" | "accompagnateur";

const roleLabels: Record<string, string> = {
  arbitre: "Arbitre",
  encadrant: "Encadrant",
  accompagnateur: "Accompagnateur",
};

export default function PlanningPage() {
  const { user } = useCurrentUser();
  const { settings } = useAppSettings();
  const clubAbbr = settings.clubAbbreviation;
  const editable = canEdit(user?.roles);
  const { matchesData, isLoading: isLoadingMatches, error: matchesError, reload: reloadMatches } = useMatches();
  const { matchesData: matchesAmicauxData, reload: reloadAmicaux } = useMatchesAmicaux();
  const { data: entrainementsData, reload: reloadEntrainements } = useEntrainements();
  const { data: plateauxData, reload: reloadPlateaux } = usePlateaux();
  const { allExtras, reload: reloadAllExtras } = useAllMatchExtras();
  const { data: dashboard, busyKey, action, reload: reloadDashboard } = useDashboardData(editable);

  const [, setActiveId] = useState<string | null>(null);
  const [activeOfficiel, setActiveOfficiel] = useState<{ nom: string; telephone?: string } | null>(null);
  const [filters, setFilters] = useState<MatchFiltersType>({
    clubSearch: "",
    arbitreAFPSearch: "",
    venue: "all",
    eventType: "all",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const isLoadingAll = isLoadingMatches || matchesAmicauxData === null || entrainementsData === null || plateauxData === null;

  // Recharge les sources d'événements et d'affectations (matchs, amicaux, entraînements,
  // plateaux, extras) — c'est cet état LIVE qui alimente les badges « Manque … » des cartes.
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
  }, [reloadEventSources, reloadDashboard]);

  const alertsByKey = useMemo(() => {
    const map: Record<string, AlertItem> = {};
    for (const item of dashboard?.alerts ?? []) {
      map[`${item.eventType}:${item.eventId}`] = item;
    }
    return map;
  }, [dashboard?.alerts]);

  const autoAssign = useCallback(async (item: AlertItem, role: PlanningRole) => {
    await action(
      `assign:${item.eventId}:${role}`,
      () => apiPost("/api/planning/auto-assign", { eventType: item.eventType, eventId: item.eventId, role }),
      `${roleLabels[role]} affecté automatiquement`,
    );
    // `action` recharge le dashboard ; on resynchronise aussi l'état LIVE des cartes
    // (extras) pour que le badge « Manque Arbitre » disparaisse immédiatement.
    reloadEventSources();
  }, [action, reloadEventSources]);

  const remind = useCallback(async (item: AlertItem) => {
    await action(
      `remind:${item.eventId}`,
      () => apiPost("/api/planning/reminders", { eventType: item.eventType, eventId: item.eventId }),
      "Relance(s) envoyée(s)",
    );
    reloadEventSources();
  }, [action, reloadEventSources]);

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
          const timeA = "time" in a ? a.time : "";
          const timeB = "time" in b ? b.time : "";
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
        // Filtre par type d'événement
        if (filters.eventType !== "all") {
          // Déterminer le type de l'événement
          let eventType: "officiel" | "amical" | "entrainement" | "plateau";

          if ("type" in event && event.type) {
            // Si l'événement a un type explicite
            eventType = event.type;
          } else if ("localTeam" in event || "competition" in event) {
            // Si c'est un match, vérifier s'il vient de matchesData (officiel) ou matchesAmicauxData (amical)
            const match = event as Match;
            eventType = match.type === "amical" ? "amical" : "officiel";
          } else if ("lieu" in event) {
            // C'est un entraînement ou un plateau
            const simpleEvent = event as Entrainement | Plateau;
            eventType = simpleEvent.type;
          } else {
            // Type inconnu, on rejette l'événement si on ne peut pas le classifier
            return false;
          }

          // Comparer avec le filtre
          const filterType = filters.eventType as "officiel" | "amical" | "entrainement" | "plateau";
          if (eventType !== filterType) {
            return false;
          }
        }

        // Les filtres ne s'appliquent qu'aux matchs (officiels et amicaux)
        if ("localTeam" in event || "competition" in event) {
          const match = event as Match;

          // Filtre par club
          if (filters.clubSearch) {
            const searchLower = filters.clubSearch.toLowerCase();
            const matchesClub = match.localTeam?.toLowerCase().includes(searchLower) || match.awayTeam?.toLowerCase().includes(searchLower);
            if (!matchesClub) return false;
          }

          // Filtre par venue (seulement pour les matchs)
          if (filters.venue !== "all" && match.venue && match.venue !== filters.venue) {
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
              hasMatchingArbitre = matchExtras.arbitreTouche.some((arbitre) => arbitre.nom.toLowerCase().includes(searchLower));
            } else if (matchExtras.arbitreTouche && typeof matchExtras.arbitreTouche === "object" && "nom" in matchExtras.arbitreTouche) {
              const arbitreObj = matchExtras.arbitreTouche as { nom: string; numero?: string };
              hasMatchingArbitre = arbitreObj.nom.toLowerCase().includes(searchLower);
            }

            if (!hasMatchingArbitre) return false;
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

    // Vérifier que c'est un officiel qui est glissé
    if (activeData?.type !== "officiel" || !activeData.officiel) {
      return;
    }

    // Vérifier que c'est une zone de drop
    if (!overData?.eventId || !overData?.role) {
      return;
    }

    const officiel = activeData.officiel;
    const eventId = overData.eventId as string;
    const role = overData.role as "arbitre" | "encadrant" | "accompagnateur";
    const eventType = overData.eventType as "match" | "entrainement" | "plateau";

    // Trouver l'événement cible
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
        // Pour les matchs, utiliser allExtras comme source de vérité (déjà chargé)
        // Si pas disponible, faire un fetch
        let currentExtras = allExtras[eventId] || null;

        // Si pas dans allExtras, faire un fetch pour récupérer les données
        if (!currentExtras) {
          currentExtras = await fetch(`/api/matches/${eventId}`)
            .then((res) => res.json())
            .catch(() => null);
        }

        // Normaliser les tableaux pour s'assurer qu'ils sont toujours des tableaux
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

        // Créer une copie pour la mise à jour
        const updatedExtras = { ...normalizedExtras };

        // Ajouter le nouvel officiel selon le rôle, sans écraser les autres
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
        // Recharger immédiatement les extras pour éviter les conditions de course
        await reloadAllExtras();
      } else if (eventType === "entrainement" || eventType === "plateau") {
        // Pour les entraînements et plateaux, mettre à jour directement
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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Espace de préparation</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Construire et modifier le planning</h1>
            {clubAbbr && <Badge variant="outline" className="uppercase">{clubAbbr}</Badge>}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Actualisez les événements, ajoutez-les, affectez les officiels puis publiez le planning global.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
          <ScraperButton onScrapeComplete={reloadAll} />
          <PublishPlanningControl onPublished={reloadAll} />
        </div>
      </header>

      {dashboard && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Événements", dashboard.totals.events, undefined],
            ["Complets", dashboard.totals.complete, "text-emerald-600 dark:text-emerald-400"],
            ["À traiter", dashboard.totals.attention, dashboard.totals.attention > 0 ? "text-destructive" : undefined],
            ["Rôles manquants", dashboard.totals.missingRoles, dashboard.totals.missingRoles > 0 ? "text-destructive" : undefined],
            ["En attente", dashboard.totals.pending, undefined],
            ["Refus", dashboard.totals.declined, dashboard.totals.declined > 0 ? "text-destructive" : undefined],
          ].map(([label, value, tone]) => (
            <Card key={String(label)}>
              <CardContent className="p-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className={`mt-0.5 text-xl font-bold leading-tight ${tone ?? "text-foreground"}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

        {isLoadingAll ? (
          <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
        ) : matchesError ? (
          <ErrorMessage message={matchesError} onRetry={reloadAll} />
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <MatchFilters filters={filters} onFiltersChange={setFilters} />
            <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-350px)] lg:min-h-[34rem] lg:grid-cols-[350px_1fr]">
              <OfficielsPanel className="lg:h-full" events={filteredEvents} allExtras={allExtras} onEventUpdate={reloadAll} />
              <EventsPanel
                events={filteredEvents}
                allExtras={allExtras}
                onEventUpdate={reloadAll}
                className="lg:h-full"
                alerts={alertsByKey}
                onAutoAssign={autoAssign}
                onRemind={remind}
                actionBusy={busyKey !== null}
              />
            </div>

            <DragOverlay>
              {activeOfficiel ? (
                <div className="bg-card border-2 border-primary rounded-lg p-3 shadow-lg opacity-90">
                  <p className="font-medium text-sm">{activeOfficiel.nom}</p>
                  {activeOfficiel.telephone && <p className="text-xs text-muted-foreground">{activeOfficiel.telephone}</p>}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
    </div>
  );
}
