'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/utils/api';
import type { PlanningEventLinkType } from '@/lib/planning/event-links';

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface EventWeatherSnapshot {
  available: true;
  weatherCode: number;
  isDay: boolean | null;
  temperatureC: number | null;
  precipitationProbability: number | null;
  windGustKmh: number | null;
  severity: 'normal' | 'warning' | 'severe';
}

interface WeatherApiResponse {
  available?: boolean;
  weatherCode?: number;
  isDay?: boolean | null;
  temperatureC?: number | null;
  precipitationProbability?: number | null;
  windGustKmh?: number | null;
  severity?: 'normal' | 'warning' | 'severe';
}

const cache = new Map<string, { expiresAt: number; value: Promise<EventWeatherSnapshot | null> }>();

export function resetEventWeatherCache() {
  cache.clear();
}

function cacheKey(eventType: PlanningEventLinkType, eventId: string) {
  return `${eventType}:${eventId}`;
}

async function fetchEventWeather(
  eventType: PlanningEventLinkType,
  eventId: string,
): Promise<EventWeatherSnapshot | null> {
  try {
    const result = await apiGet<WeatherApiResponse>(
      `/api/planning/weather?eventType=${encodeURIComponent(eventType)}&eventId=${encodeURIComponent(eventId)}`,
    );
    if (!result.available || typeof result.weatherCode !== 'number') return null;
    return {
      available: true,
      weatherCode: result.weatherCode,
      isDay: typeof result.isDay === 'boolean' ? result.isDay : null,
      temperatureC: result.temperatureC ?? null,
      precipitationProbability: result.precipitationProbability ?? null,
      windGustKmh: result.windGustKmh ?? null,
      severity: result.severity ?? 'normal',
    };
  } catch {
    return null;
  }
}

export function loadEventWeather(
  eventType: PlanningEventLinkType,
  eventId: string,
): Promise<EventWeatherSnapshot | null> {
  const key = cacheKey(eventType, eventId);
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;

  const value = fetchEventWeather(eventType, eventId).then((result) => {
    if (!result) cache.delete(key);
    return result;
  });
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

/**
 * Prévision Open-Meteo pour l'heure de l'événement (déjà résolue côté API).
 * Échec ou fonctionnalité désactivée : `null`, sans toast.
 */
export function useEventWeather(
  eventType?: PlanningEventLinkType | null,
  eventId?: string,
) {
  const [weather, setWeather] = useState<EventWeatherSnapshot | null>(null);

  useEffect(() => {
    if (!eventType || !eventId) {
      setWeather(null);
      return;
    }

    let cancelled = false;
    void loadEventWeather(eventType, eventId).then((result) => {
      if (!cancelled) setWeather(result);
    });

    return () => {
      cancelled = true;
    };
  }, [eventType, eventId]);

  return weather;
}
