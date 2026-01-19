'use client';

import { useMemo, memo, useState } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { EventCardDrag } from './EventCardDrag';
import { AddEventDialog, EventType } from '@/components/ui/add-event-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Calendar } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sortDates, formatDateWithDayName } from '@/lib/utils/date';

type Event = Match | Entrainement | Plateau;

interface EventsPanelProps {
  events: Record<string, Event[]>;
  onEventUpdate: () => void;
  className?: string;
}

export const EventsPanel = memo(function EventsPanel({
  events,
  onEventUpdate,
  className,
}: EventsPanelProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogType, setAddDialogType] = useState<EventType>('amical');

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
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Événements
            </h2>
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
          <p className="text-sm text-muted-foreground">
            Cliquez sur un officiel à gauche pour affectation rapide, ou utilisez les dropdowns ci-dessous
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {sortedDates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Aucun événement</p>
              <p className="text-sm text-muted-foreground mt-2">
                Cliquez sur "Ajouter" pour créer un événement
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
                      {dateEvents.map((event, index) => (
                        <EventCardDrag
                          key={`${date}-${index}-${event.id || index}`}
                          event={event}
                          onEventUpdate={onEventUpdate}
                          onDelete={onEventUpdate}
                        />
                      ))}
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
    </div>
  );
});
