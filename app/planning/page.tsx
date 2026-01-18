'use client';

import { useState, useMemo, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useMatches } from '../hooks/useMatches';
import { useMatchesAmicaux } from '../hooks/useMatchesAmicaux';
import { useEntrainements } from '../hooks/useEntrainements';
import { usePlateaux } from '../hooks/usePlateaux';
import { useOfficiels } from '../hooks/useOfficiels';
import { useAllMatchExtras } from '../hooks/useAllMatchExtras';
import { Header } from '../components/layout/Header';
import { EventsPanel } from '../components/planning/EventsPanel';
import { OfficielsPanel } from '../components/planning/OfficielsPanel';
import { MatchFilters, MatchFilters as MatchFiltersType } from '../components/matches/MatchFilters';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { ErrorMessage } from '../components/ui/error-message';
import { Match, Entrainement, Plateau } from '@/types/match';
import { ContactOfficiel } from '../hooks/useMatchExtras';
import { apiPut } from '../lib/utils/api';
import { toast } from 'sonner';

type Event = Match | Entrainement | Plateau;

export default function PlanningPage() {
  const { matchesData, isLoading: isLoadingMatches, error: matchesError, reload: reloadMatches } = useMatches();
  const { matchesData: matchesAmicauxData, reload: reloadAmicaux } = useMatchesAmicaux();
  const { data: entrainementsData, reload: reloadEntrainements } = useEntrainements();
  const { data: plateauxData, reload: reloadPlateaux } = usePlateaux();
  const { officiels } = useOfficiels();
  const { allExtras } = useAllMatchExtras();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOfficiel, setActiveOfficiel] = useState<{ nom: string; telephone?: string } | null>(null);
  const [filters, setFilters] = useState<MatchFiltersType>({
    clubSearch: '',
    arbitreAFPSearch: '',
    venue: 'all',
    completed: 'all',
    eventType: 'all',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const isLoadingAll =
    isLoadingMatches ||
    matchesAmicauxData === null ||
    entrainementsData === null ||
    plateauxData === null;

  const reloadAll = useCallback(() => {
    reloadMatches();
    reloadAmicaux();
    reloadEntrainements();
    reloadPlateaux();
  }, [reloadMatches, reloadAmicaux, reloadEntrainements, reloadPlateaux]);

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
          const timeA = 'time' in a ? a.time : '';
          const timeB = 'time' in b ? b.time : '';
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
        if (filters.eventType !== 'all') {
          // Déterminer le type de l'événement
          let eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
          
          if ('type' in event && event.type) {
            // Si l'événement a un type explicite
            eventType = event.type;
          } else if ('localTeam' in event || 'competition' in event) {
            // Si c'est un match, vérifier s'il vient de matchesData (officiel) ou matchesAmicauxData (amical)
            const match = event as Match;
            eventType = match.type === 'amical' ? 'amical' : 'officiel';
          } else if ('lieu' in event) {
            // C'est un entraînement ou un plateau
            const simpleEvent = event as Entrainement | Plateau;
            eventType = simpleEvent.type;
          } else {
            // Type inconnu, on rejette l'événement si on ne peut pas le classifier
            return false;
          }
          
          // Comparer avec le filtre
          const filterType = filters.eventType as 'officiel' | 'amical' | 'entrainement' | 'plateau';
          if (eventType !== filterType) {
            return false;
          }
        }

        // Les filtres ne s'appliquent qu'aux matchs (officiels et amicaux)
        if ('localTeam' in event || 'competition' in event) {
          const match = event as Match;

          // Filtre par club
          if (filters.clubSearch) {
            const searchLower = filters.clubSearch.toLowerCase();
            const matchesClub =
              match.localTeam?.toLowerCase().includes(searchLower) ||
              match.awayTeam?.toLowerCase().includes(searchLower);
            if (!matchesClub) return false;
          }

          // Filtre par venue (seulement pour les matchs)
          if (filters.venue !== 'all' && match.venue && match.venue !== filters.venue) {
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
    if (activeData?.type === 'officiel' && activeData.officiel) {
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
    if (activeData?.type !== 'officiel' || !activeData.officiel) {
      return;
    }

    // Vérifier que c'est une zone de drop
    if (!overData?.eventId || !overData?.role) {
      return;
    }

    const officiel = activeData.officiel;
    const eventId = overData.eventId as string;
    const role = overData.role as 'arbitre' | 'encadrant' | 'accompagnateur';
    const eventType = overData.eventType as 'match' | 'entrainement' | 'plateau';

    // Trouver l'événement cible
    let targetEvent: Event | null = null;
    for (const date in allEvents) {
      const events = allEvents[date];
      const found = events.find((e) => e.id === eventId);
      if (found) {
        targetEvent = found;
        break;
      }
    }

    if (!targetEvent) {
      toast.error('Événement non trouvé');
      return;
    }

    const contact: ContactOfficiel = {
      nom: officiel.nom,
      numero: officiel.telephone || '',
    };

    try {
      if (eventType === 'match') {
        // Pour les matchs, utiliser l'API matches/[id]
        const currentExtras = await fetch(`/api/matches/${eventId}`)
          .then((res) => res.json())
          .catch(() => null);

        const updatedExtras = {
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

        if (role === 'arbitre') {
          const existing = updatedExtras.arbitreTouche || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.arbitreTouche = [...existing, contact];
          }
        } else if (role === 'encadrant') {
          const existing = updatedExtras.contactEncadrants || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.contactEncadrants = [...existing, contact];
          }
        } else if (role === 'accompagnateur') {
          const existing = updatedExtras.contactAccompagnateur || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.contactAccompagnateur = [...existing, contact];
          }
        }

        await apiPut(`/api/matches/${eventId}`, updatedExtras);
      } else if (eventType === 'entrainement' || eventType === 'plateau') {
        // Pour les entraînements et plateaux, mettre à jour directement
        const currentEncadrants = (targetEvent as Entrainement | Plateau).encadrants || [];
        if (!currentEncadrants.some((c) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
          const updatedEvent = {
            ...targetEvent,
            encadrants: [...currentEncadrants, contact],
          };
          await apiPut(
            eventType === 'entrainement' ? '/api/entrainements' : '/api/plateaux',
            updatedEvent
          );
        }
      }

      toast.success('Officiel affecté avec succès');
      reloadAll();
    } catch (error) {
      console.error('Error assigning officiel:', error);
      toast.error('Erreur lors de l\'affectation de l\'officiel');
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveOfficiel(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={reloadMatches} onEventAdded={reloadAll} />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {isLoadingAll ? (
          <LoadingSpinner size={48} text="Chargement des événements..." className="py-20" />
        ) : matchesError ? (
          <ErrorMessage message={matchesError} onRetry={reloadAll} />
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="mb-4">
              <MatchFilters filters={filters} onFiltersChange={setFilters} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4 h-[calc(100vh-350px)]">
              <OfficielsPanel 
                className="h-full" 
                events={filteredEvents}
                onEventUpdate={reloadAll}
              />
              <EventsPanel events={filteredEvents} onEventUpdate={reloadAll} className="h-full" />
            </div>

            <DragOverlay>
              {activeOfficiel ? (
                <div className="bg-card border-2 border-primary rounded-lg p-3 shadow-lg opacity-90">
                  <p className="font-medium text-sm">{activeOfficiel.nom}</p>
                  {activeOfficiel.telephone && (
                    <p className="text-xs text-muted-foreground">{activeOfficiel.telephone}</p>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}
