'use client';

import { useMemo, memo } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { sortDates, formatDateWithDayName } from '@/lib/utils/date';
import { EventCard } from './EventCard';
import { EventListItem } from './EventListItem';
import { ViewMode } from '../ui/view-toggle';

type Event = Match | Entrainement | Plateau;

interface EventListProps {
  events: Record<string, Event[]>;
  view: ViewMode;
  onEventUpdate?: () => void;
}

export const EventList = memo(function EventList({ events, view, onEventUpdate }: EventListProps) {
  const sortedDates = useMemo(() => sortDates(Object.keys(events)), [events]);

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">Aucun événement trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {sortedDates.map((date) => {
        const eventList = events[date];
        if (!eventList) return null;

        return (
          <div key={date} className="space-y-3 sm:space-y-4">
            <div className="sticky top-0 z-10 bg-muted border-2 border-primary/20 text-foreground px-4 sm:px-6 py-2 sm:py-3 rounded-lg shadow-sm">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold break-words">{formatDateWithDayName(date)}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {eventList.length} événement{eventList.length > 1 ? 's' : ''}
              </p>
            </div>
            {view === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {eventList.map((event, index) => (
                  <EventCard
                    key={`${date}-${index}-${event.id || index}`}
                    event={event}
                    onEventUpdate={onEventUpdate}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {eventList.map((event, index) => (
                  <EventListItem
                    key={`${date}-${index}-${event.id || index}`}
                    event={event}
                    onEventUpdate={onEventUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
