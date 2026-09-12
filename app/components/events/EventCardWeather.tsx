'use client';

import { useEventWeather } from '@/hooks/useEventWeather';
import type { PlanningEventLinkType } from '@/lib/planning/event-links';
import { getWeatherPresentation, type EventWeatherDisplay } from '@/lib/planning/weather-condition';
import { WeatherConditionIcon } from './WeatherConditionIcon';
import { cn } from '@/lib/utils';

interface EventCardWeatherProps {
  eventType?: PlanningEventLinkType | null;
  eventId?: string;
  /** Prévision déjà chargée (lien public) : aucun appel authentifié. */
  weather?: EventWeatherDisplay | null;
  variant?: 'card' | 'inline';
  className?: string;
}

export function EventCardWeather({
  eventType,
  eventId,
  weather: preloadedWeather,
  variant = 'card',
  className,
}: EventCardWeatherProps) {
  const fetchedWeather = useEventWeather(
    preloadedWeather === undefined ? eventType : null,
    preloadedWeather === undefined ? eventId : undefined,
  );
  const weather = preloadedWeather === undefined ? fetchedWeather : preloadedWeather;
  if (!weather) return null;

  const condition = getWeatherPresentation(weather.weatherCode, weather.isDay);
  const temperature = weather.temperatureC !== null && weather.temperatureC !== undefined
    ? `${Math.round(weather.temperatureC)} °C`
    : null;

  if (variant === 'inline') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs text-foreground', className)}
        title={`Météo à l’heure de l’événement : ${condition.label}${temperature ? ` · ${temperature}` : ''}`}
      >
        <WeatherConditionIcon
          kind={condition.icon}
          label={condition.label}
          className="h-4 w-4 shrink-0 text-sky-500"
        />
        <span className="font-medium">{condition.label}</span>
        {temperature && <span className="text-muted-foreground">{temperature}</span>}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'mb-4 flex items-center justify-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-sm',
        className,
      )}
      title="Prévision à l’heure de l’événement"
    >
      <WeatherConditionIcon
        kind={condition.icon}
        label={condition.label}
        className="h-6 w-6 shrink-0 text-sky-500"
      />
      <span className="font-medium text-foreground">{condition.label}</span>
      {temperature && <span className="text-muted-foreground">{temperature}</span>}
    </div>
  );
}
