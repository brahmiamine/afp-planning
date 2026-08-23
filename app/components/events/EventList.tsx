'use client';

import { memo, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Match, Entrainement, Plateau } from '@/types/match';
import { sortDates, formatDateWithDayName } from '@/lib/utils/date';
import { eventWorkspaceHref, planningEventTypeFromEvent } from '@/lib/planning/event-links';
import { EventCard } from './EventCard';
import { EventListItem } from './EventListItem';
import { EventCalendar } from './EventCalendar';
import { ViewMode } from '../ui/view-toggle';

type Event = Match | Entrainement | Plateau;

interface EventListProps {
  events: Record<string, Event[]>;
  view: ViewMode;
  onEventUpdate?: () => void;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
}

export const EventList = memo(function EventList({ events, view, onEventUpdate }: EventListProps) {
  const router = useRouter();
  const sortedDates = useMemo(() => sortDates(Object.keys(events)), [events]);

  const openEvent = (event: Event) => {
    if (!event.id) return;
    router.push(eventWorkspaceHref(planningEventTypeFromEvent(event), event.id));
  };

  if (view === 'calendar') {
    return <EventCalendar events={events} onEventUpdate={onEventUpdate} />;
  }

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
                  <div
                    key={`${date}-${index}-${event.id || index}`}
                    className={event.id ? 'cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : undefined}
                    role={event.id ? 'link' : undefined}
                    tabIndex={event.id ? 0 : -1}
                    aria-label={event.id ? 'Ouvrir l’espace événement' : undefined}
                    onClick={(clickEvent) => {
                      if (!isInteractiveTarget(clickEvent.target)) openEvent(event);
                    }}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === 'Enter' && keyboardEvent.target === keyboardEvent.currentTarget) openEvent(event);
                    }}
                  >
                    <EventCard event={event} onEventUpdate={onEventUpdate} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {eventList.map((event, index) => (
                  <div
                    key={`${date}-${index}-${event.id || index}`}
                    className={event.id ? 'cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : undefined}
                    role={event.id ? 'link' : undefined}
                    tabIndex={event.id ? 0 : -1}
                    aria-label={event.id ? 'Ouvrir l’espace événement' : undefined}
                    onClick={(clickEvent) => {
                      if (!isInteractiveTarget(clickEvent.target)) openEvent(event);
                    }}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === 'Enter' && keyboardEvent.target === keyboardEvent.currentTarget) openEvent(event);
                    }}
                  >
                    <EventListItem event={event} onEventUpdate={onEventUpdate} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
