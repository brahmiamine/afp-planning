'use client';

import { useMemo, memo, useState } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { EventCardDrag } from './EventCardDrag';
import { AddEventDialog, EventType } from '@/components/ui/add-event-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Calendar, LayoutTemplate } from 'lucide-react';
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
import type { AlertItem } from '@/hooks/useDashboardData';

type Event = Match | Entrainement | Plateau;

interface EventsPanelProps {
  events: Record<string, Event[]>;
  allExtras?: Record<string, MatchExtras>;
  onEventUpdate: () => void;
  className?: string;
  /** Signaux opérationnels par événement (`eventType:eventId` → alerte). */
  alerts?: Record<string, AlertItem>;
  /** Points bloquants de publication par événement (`eventType:eventId` → messages). */
  publicationBlockers?: Record<string, string[]>;
  onRemind?: (item: AlertItem) => void;
  actionBusy?: boolean;
}

export const EventsPanel = memo(function EventsPanel({
  events,
  allExtras,
  onEventUpdate,
  className,
  alerts,
  publicationBlockers,
  onRemind,
  actionBusy,
}: EventsPanelProps) {
  const { user } = useCurrentUser();
  const editable = canEdit(user?.accessRole);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogType, setAddDialogType] = useState<EventType>('amical');
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);

  const sortedDates = useMemo(() => sortDates(Object.keys(events)), [events]);

  const handleAddClick = (type: EventType) => {
    setAddDialogType(type);
    setAddDialogOpen(true);
  };

  const handleAddSuccess = () => {
    setAddDialogOpen(false);
    onEventUpdate();
  };

  return (
    <div className={className}>
      <Card className="h-full flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex shrink-0 items-center gap-2 text-lg font-semibold">
              <Calendar className="h-5 w-5 shrink-0" />
              Événements
            </h2>
            {editable && (
              <div className="flex shrink-0 items-center gap-1.5">
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
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {sortedDates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Aucun événement</p>
              <p className="text-sm text-muted-foreground mt-2">
                Cliquez sur &quot;Ajouter&quot; pour créer un événement
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((date) => {
                const dateEvents = events[date];
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
                        return (
                          <div key={`${date}-${index}-${event.id || index}`} className="min-w-0">
                            <EventCardDrag
                              event={event}
                              allEvents={events}
                              allExtras={allExtras}
                              onEventUpdate={onEventUpdate}
                              onDelete={onEventUpdate}
                              alert={alert}
                              publicationBlockers={eventBlockers}
                              onRemind={alert && onRemind ? () => onRemind(alert) : undefined}
                              actionBusy={actionBusy}
                            />
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
