/**
 * Transformation des codes WMO Open-Meteo en présentation UI.
 * La condition ne se déduit jamais de la température : `weather_code` est la source de vérité.
 */

import { UNKNOWN_WEATHER_PRESENTATION, WEATHER_CODE_CATALOG } from './weather-codes';
import type { DayOrNight, WeatherPresentation } from './weather-types';

function resolveDayOrNight<T>(value: DayOrNight<T>, isDay: boolean): T {
  if (value && typeof value === 'object' && 'day' in value && 'night' in value) {
    return isDay ? value.day : value.night;
  }
  return value as T;
}

/**
 * Interprète un code WMO Open-Meteo. Un code inconnu, NaN ou non fini
 * renvoie le fallback « Conditions météo inconnues » sans lever.
 */
export function getWeatherPresentation(
  weatherCode: number,
  isDay?: boolean | null,
): WeatherPresentation {
  const spec = Number.isFinite(weatherCode)
    ? WEATHER_CODE_CATALOG[weatherCode as keyof typeof WEATHER_CODE_CATALOG]
    : undefined;
  if (!spec) return { ...UNKNOWN_WEATHER_PRESENTATION };

  const day = isDay !== false;
  return {
    label: spec.label,
    icon: resolveDayOrNight(spec.icon, day),
    emoji: resolveDayOrNight(spec.emoji, day),
  };
}
