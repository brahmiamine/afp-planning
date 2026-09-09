'use client';

import { useEffect, useMemo, memo, useState, useCallback } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { EventCardDrag } from './EventCardDrag';
import { AddEventDialog, EventType } from '@/components/ui/add-event-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Calendar, LayoutTemplate, Trash2, X } from 'lucide-react';
import { EventTemplatesDialog } from './EventTemplatesDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sortDates, formatDateWithDayName } from '@/lib/utils/date';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';
import type { AlertItem } from '@/hooks/useDashboardData';
import { MatchFilters as MatchFiltersBar, type MatchFilters as MatchFiltersState } from '@/components/matches/MatchFilters';
import { SavedFiltersBar } from './SavedFiltersBar';
import { eventTypeOf, filterEventsByDate, hasActiveFilters as computeHasActiveFilters } from '@/lib/planning/event-list-filters';

type Event = Match | Entrainement | Plateau;
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

interface EventsPanelProps {
  events: Record<string, Event[]>;
  allExtras?: Record<string, MatchExtras>;
  onEventUpdate: () => void;
  className?: string;
  /** Signaux opérationnels par événement (`eventType:eventId` → alerte). */
  alerts?: Record<string, AlertItem>;
  /** Points bloquants de publication par événement (`eventType:eventId` → messages). */
  publicationBlockers?: Record<string, string[]>;
  onAutoAssign?: (item: AlertItem, role: PlanningRole) => void;
  onRemind?: (item: AlertItem) => void;
  actionBusy?: boolean;
}

const DEFAULT_FILTERS: MatchFiltersState = {
  clubSearch: '',
  arbitreAFPSearch: '',
  venue: 'all',
  eventType: 'all',
};

function eventKeyOf(event: Event, eventType: string | undefined): string {
  return `${eventType ?? 'inconnu'}:${event.id ?? ''}`;
}

function eventEndpoint(eventType: string | undefined, id: string): string | null {
  if (eventType === 'amical') return `/api/matches-amicaux?id=${encodeURIComponent(id)}`;
  if (eventType === 'entrainement') return `/api/entrainements?id=${encodeURIComponent(id)}`;
  if (eventType === 'plateau') return `/api/plateaux?id=${encodeURIComponent(id)}`;
  return null;
}

export const EventsPanel = memo(function EventsPanel({
  events,
  allExtras,
  onEventUpdate,
  className,
  alerts,
  publicationBlockers,
  onAutoAssign,
  onRemind,
  actionBusy,
}: EventsPanelProps) {
  const { user } = useCurrentUser();
  const editable = canEdit(user?.accessRole);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogType, setAddDialogType] = useState<EventType>('amical');
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [filters, setFilters] = useState<MatchFiltersState>(DEFAULT_FILTERS);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const hasActiveFilters = computeHasActiveFilters(filters);

  const filteredEvents = useMemo(
    () => filterEventsByDate(events, filters, allExtras),
    [events, filters, allExtras],
  );

  // Une sélection ne doit pas survivre à un changement de filtre ou de source qui la
  // rendrait invisible/obsolète : on ne garde que les clés encore affichées.
  useEffect(() => {
    setSelectedKeys((current) => {
      if (current.size === 0) return current;
      const visibleKeys = new Set(Object.values(filteredEvents).flat().map((event) => eventKeyOf(event, eventTypeOf(event))));
      const next = new Set([...current].filter((key) => visibleKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [filteredEvents]);

  const sortedDates = useMemo(() => sortDates(Object.keys(filteredEvents)), [filteredEvents]);

  const handleAddClick = (type: EventType) => {
    setAddDialogType(type);
    setAddDialogOpen(true);
  };

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    onEventUpdate();
  };

  const toggleSelected = useCallback((key: string, checked: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    if (!window.confirm(`Supprimer les ${selectedKeys.size} événement(s) sélectionné(s) ?`)) return;

    setIsBulkDeleting(true);
    try {
      // Chaque suppression réutilise la route atomique d'un seul événement (gestion de la
      // suppression différée pour un événement déjà publié comprise) : une action en masse
      // n'est qu'un lot d'actions unitaires indépendantes, pas une nouvelle transaction globale.
      const targets = [...selectedKeys].map((key) => {
        const [eventType, id] = key.split(':');
        return { eventType, id, endpoint: eventEndpoint(eventType, id ?? '') };
      }).filter((target): target is { eventType: string; id: string; endpoint: string } => Boolean(target.endpoint));

      const results = await Promise.allSettled(targets.map((target) => apiDelete(target.endpoint)));
      const failed = results.filter((result) => result.status === 'rejected').length;
      const succeeded = results.length - failed;

      if (succeeded > 0) toast.success(`${succeeded} événement(s) supprimé(s)`);
      if (failed > 0) toast.error(`${failed} suppression(s) ont échoué`);

      clearSelection();
      onEventUpdate();
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedKeys, clearSelection, onEventUpdate]);

  return (
    <div className={className}>
      <Card className="h-full flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Événements
            </h2>
            {editable && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="flex items-center gap-2" onClick={() => setTemplatesDialogOpen(true)}>
                  <LayoutTemplate className="h-4 w-4" />
                  Modèles
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Ajouter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleAddClick('amical')}>
                      Match amical
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddClick('entrainement')}>
                      Entraînement
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddClick('plateau')}>
                      Plateau
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Cliquez sur un officiel à gauche pour affectation rapide, ou utilisez les dropdowns ci-dessous
          </p>

          <MatchFiltersBar filters={filters} onFiltersChange={setFilters} />
          <SavedFiltersBar currentFilters={filters} onApply={setFilters} />

          {selectedKeys.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <span className="text-sm font-medium">{selectedKeys.size} sélectionné(s)</span>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Supprimer la sélection
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Annuler
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {sortedDates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{hasActiveFilters ? 'Aucun événement ne correspond à ces filtres' : 'Aucun événement'}</p>
              {!hasActiveFilters && (
                <p className="text-sm text-muted-foreground mt-2">
                  Cliquez sur "Ajouter" pour créer un événement
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((date) => {
                const dateEvents = filteredEvents[date];
                if (!dateEvents || dateEvents.length === 0) return null;

                return (
                  <div key={date} className="space-y-3">
                    <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-md">
                      <h3 className="font-bold text-base">
                        {formatDateWithDayName(date)}
                      </h3>
                      <p className="text-xs opacity-90">
                        {dateEvents.length} événement{dateEvents.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                      {dateEvents.map((event, index) => {
                        const eventType = 'type' in event && event.type
                          ? event.type
                          : ('localTeam' in event || 'competition' in event)
                            ? 'officiel'
                            : undefined;
                        const alert = alerts && event.id && eventType
                          ? alerts[`${eventType}:${event.id}`]
                            ?? alerts[`amical:${event.id}`]
                            ?? alerts[`officiel:${event.id}`]
                          : undefined;
                        const eventBlockers = publicationBlockers && event.id && eventType
                          ? publicationBlockers[`${eventType}:${event.id}`]
                            ?? publicationBlockers[`amical:${event.id}`]
                            ?? publicationBlockers[`officiel:${event.id}`]
                          : undefined;
                        const selectable = editable && event.id && (eventType === 'amical' || eventType === 'entrainement' || eventType === 'plateau');
                        const key = eventKeyOf(event, eventType);
                        return (
                          <div key={`${date}-${index}-${event.id || index}`} className="flex items-start gap-1.5">
                            {selectable && (
                              <Checkbox
                                className="mt-4 shrink-0"
                                checked={selectedKeys.has(key)}
                                onCheckedChange={(checked) => toggleSelected(key, checked === true)}
                                aria-label="Sélectionner cet événement"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <EventCardDrag
                                event={event}
                                allEvents={events}
                                allExtras={allExtras}
                                onEventUpdate={onEventUpdate}
                                onDelete={onEventUpdate}
                                alert={alert}
                                publicationBlockers={eventBlockers}
                                onAutoAssign={alert && onAutoAssign ? (role) => onAutoAssign(alert, role) : undefined}
                                onRemind={alert && onRemind ? () => onRemind(alert) : undefined}
                                actionBusy={actionBusy}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <AddEventDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        eventType={addDialogType}
        onSuccess={handleAddSuccess}
      />
      <EventTemplatesDialog
        open={templatesDialogOpen}
        onOpenChange={setTemplatesDialogOpen}
        onCreated={onEventUpdate}
      />
    </div>
  );
});
