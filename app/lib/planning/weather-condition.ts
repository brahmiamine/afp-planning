/**
 * Façade client-safe du système météo centralisé.
 * Les mappings WMO vivent dans `weather-codes.ts` / `weather-mapper.ts`.
 */

export type {
  EventWeatherDisplay,
  WeatherCondition,
  WeatherIconKind,
  WeatherPresentation,
} from './weather-types';
export { OPEN_METEO_WEATHER_CODES, UNKNOWN_WEATHER_PRESENTATION } from './weather-codes';
export { getWeatherPresentation } from './weather-mapper';

import { getWeatherPresentation } from './weather-mapper';
import type { WeatherCondition } from './weather-types';

/** Compatibilité : même source que `getWeatherPresentation`. */
export function weatherConditionFromCode(code: number, isDay?: boolean | null): WeatherCondition {
  const presentation = getWeatherPresentation(code, isDay);
  return { kind: presentation.icon, label: presentation.label };
}
