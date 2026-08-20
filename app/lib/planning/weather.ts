import type { DataSource } from 'typeorm';
import { getPlanningEventSnapshot, type PlanningEventType } from './event-store';
import { eventStartTimestamp } from './p0-rules';
import { eventCoordinatesFromResources } from './resources';
import { readAppSettings } from '@/lib/settings-store';
import { getCurrentClubId } from '@/lib/auth/club-context';

export type WeatherSeverity = 'normal' | 'warning' | 'severe';

export type PlanningWeatherResult =
  | { available: false; reason: string }
  | {
      available: true;
      severity: WeatherSeverity;
      weatherCode: number;
      temperatureC: number | null;
      precipitationProbability: number | null;
      windGustKmh: number | null;
      alerts: string[];
      coordinates?: { lat: number; lon: number };
      locationSource?: string;
    };

interface OpenMeteoPayload {
  hourly?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    wind_gusts_10m?: unknown;
  };
}

function numericAt(value: unknown, index: number): number | null {
  if (!Array.isArray(value)) return null;
  const item = Number(value[index]);
  return Number.isFinite(item) ? item : null;
}

export function parseOpenMeteoForecast(payload: unknown, targetIsoHour: string): PlanningWeatherResult {
  if (!payload || typeof payload !== 'object') return { available: false, reason: 'forecast-unavailable' };
  const hourly = (payload as OpenMeteoPayload).hourly;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    return { available: false, reason: 'forecast-unavailable' };
  }

  const normalizedTarget = /(?:Z|[+-]\d{2}:?\d{2})$/.test(targetIsoHour)
    ? targetIsoHour
    : `${targetIsoHour}${targetIsoHour.length === 16 ? ':00' : ''}Z`;
  const target = Date.parse(normalizedTarget);
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  hourly.time.forEach((raw, index) => {
    if (typeof raw !== 'string') return;
    const stamp = Date.parse(`${raw}:00Z`);
    if (!Number.isFinite(stamp)) return;
    const distance = Math.abs(stamp - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  if (bestIndex < 0) return { available: false, reason: 'forecast-unavailable' };

  const weatherCode = numericAt(hourly.weather_code, bestIndex);
  if (weatherCode === null) return { available: false, reason: 'forecast-unavailable' };
  const temperatureC = numericAt(hourly.temperature_2m, bestIndex);
  const precipitationProbability = numericAt(hourly.precipitation_probability, bestIndex);
  const windGustKmh = numericAt(hourly.wind_gusts_10m, bestIndex);
  const alerts: string[] = [];
  let severity: WeatherSeverity = 'normal';

  if ([95, 96, 99].includes(weatherCode)) {
    alerts.push('Risque d’orage');
    severity = 'severe';
  } else if ([80, 81, 82, 85, 86].includes(weatherCode)) {
    alerts.push('Averses prévues');
    severity = 'warning';
  }
  if (windGustKmh !== null && windGustKmh >= 70) {
    alerts.push(`Rafales fortes (${Math.round(windGustKmh)} km/h)`);
    severity = 'severe';
  } else if (windGustKmh !== null && windGustKmh >= 50 && severity === 'normal') {
    alerts.push(`Rafales (${Math.round(windGustKmh)} km/h)`);
    severity = 'warning';
  }
  if (precipitationProbability !== null && precipitationProbability >= 80) {
    alerts.push(`Forte probabilité de pluie (${Math.round(precipitationProbability)} %)`);
    if (severity === 'normal') severity = 'warning';
  }
  if (temperatureC !== null && temperatureC >= 35) {
    alerts.push(`Forte chaleur (${Math.round(temperatureC)} °C)`);
    if (severity === 'normal') severity = 'warning';
  }
  if (temperatureC !== null && temperatureC <= 0) {
    alerts.push(`Risque de gel (${Math.round(temperatureC)} °C)`);
    if (severity === 'normal') severity = 'warning';
  }

  return {
    available: true,
    severity,
    weatherCode,
    temperatureC,
    precipitationProbability,
    windGustKmh,
    alerts,
  };
}

async function geocodeLocation(location: string): Promise<{ lat: number; lon: number } | null> {
  const base = process.env.OPEN_METEO_GEOCODING_URL?.trim() || 'https://geocoding-api.open-meteo.com/v1/search';
  try {
    const url = new URL(base);
    url.searchParams.set('name', location);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'fr');
    url.searchParams.set('format', 'json');
    const response = await fetch(url, { signal: AbortSignal.timeout(3500), cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json() as { results?: Array<{ latitude?: number; longitude?: number }> };
    const first = data.results?.[0];
    return first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)
      ? { lat: Number(first.latitude), lon: Number(first.longitude) }
      : null;
  } catch {
    return null;
  }
}

export async function getPlanningWeather(
  db: DataSource,
  eventType: PlanningEventType,
  eventId: string,
): Promise<PlanningWeatherResult> {
  const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
  if (!snapshot) return { available: false, reason: 'event-not-found' };
  const { timeZone } = await readAppSettings(db, getCurrentClubId());
  const start = eventStartTimestamp(snapshot.date, snapshot.time, timeZone);
  if (start === null) return { available: false, reason: 'event-date-invalid' };

  const resourceCoordinates = await eventCoordinatesFromResources(db, eventType, eventId);
  let coordinates = resourceCoordinates
    ? { lat: resourceCoordinates.lat, lon: resourceCoordinates.lon }
    : null;
  let locationSource = resourceCoordinates?.resourceName ?? null;
  if (!coordinates && snapshot.location) {
    coordinates = await geocodeLocation(snapshot.location);
    locationSource = coordinates ? snapshot.location : null;
  }
  if (!coordinates) return { available: false, reason: 'coordinates-unavailable' };

  const target = new Date(start);
  const date = target.toISOString().slice(0, 10);
  const targetHour = `${target.toISOString().slice(0, 13)}:00:00Z`;
  const base = process.env.OPEN_METEO_FORECAST_URL?.trim() || 'https://api.open-meteo.com/v1/forecast';
  try {
    const url = new URL(base);
    url.searchParams.set('latitude', String(coordinates.lat));
    url.searchParams.set('longitude', String(coordinates.lon));
    url.searchParams.set('hourly', 'weather_code,temperature_2m,precipitation_probability,wind_gusts_10m');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', date);
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) return { available: false, reason: 'provider-unavailable' };
    const parsed = parseOpenMeteoForecast(await response.json(), targetHour);
    return parsed.available ? { ...parsed, coordinates, locationSource: locationSource ?? undefined } : parsed;
  } catch {
    return { available: false, reason: 'provider-unavailable' };
  }
}
