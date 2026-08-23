'use client';

import { useMemo, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Match, Entrainement, Plateau } from '@/types/match';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { EventListItem } from './EventListItem';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateWithDayName } from '@/lib/utils/date';
import { eventWorkspaceHref, planningEventTypeFromEvent } from '@/lib/planning/event-links';

type Event = Match | Entrainement | Plateau;

interface EventCalendarProps {
  events: Record<string, Event[]>;
  onEventUpdate?: () => void;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
}

const TYPE_DOT_CLASSES: Record<string, string> = {
  officiel: 'bg-blue-500',
  amical: 'bg-purple-500',
  entrainement: 'bg-green-500',
  plateau: 'bg-orange-500',
};

export const EventCalendar = memo(function EventCalendar({ events, onEventUpdate }: EventCalendarProps) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const monthLabel = visibleMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  const weeks = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - firstWeekday);

    const days: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }

    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [visibleMonth]);

  const todayKey = toDateKey(today);

  const openEvent = (event: Event) => {
    if (!event.id) return;
    router.push(eventWorkspaceHref(planningEventTypeFromEvent(event), event.id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setVisibleMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
        <Button variant="outline" size="icon" onClick={() => setVisibleMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const dateKey = toDateKey(day);
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const dayEvents = events[dateKey] || [];
              const isToday = dateKey === todayKey;

              const cell = (
                <div
                  className={cn(
                    'min-h-16 sm:min-h-20 rounded-md border p-1.5 text-left transition-colors',
                    isCurrentMonth ? 'bg-card' : 'bg-muted/40 text-muted-foreground',
                    isToday && 'border-primary bg-primary/10',
                    dayEvents.length > 0 && 'cursor-pointer hover:bg-accent/50',
                  )}
                >
                  <span className={cn('text-xs font-medium', isToday && 'text-primary font-bold')}>{day.getDate()}</span>
                  {dayEvents.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {dayEvents.slice(0, 4).map((event, idx) => (
                        <span
                          key={idx}
                          className={cn('h-1.5 w-1.5 rounded-full', TYPE_DOT_CLASSES[planningEventTypeFromEvent(event)])}
                        />
                      ))}
                      {dayEvents.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              );

              if (dayEvents.length === 0) {
                return <div key={dateKey}>{cell}</div>;
              }

              return (
                <Popover key={dateKey}>
                  <PopoverTrigger asChild>{cell}</PopoverTrigger>
                  <PopoverContent className="w-80 max-h-96 overflow-y-auto space-y-2" align="start">
                    <p className="text-sm font-semibold">{formatDateWithDayName(dateKey)}</p>
                    <div className="space-y-2">
                      {dayEvents.map((event, idx) => (
                        <div
                          key={`${event.id || idx}:${idx}`}
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
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
