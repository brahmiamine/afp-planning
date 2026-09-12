/**
 * Types du système météo centralisé (Open-Meteo / codes WMO).
 * Module pur, importable depuis un Client Component.
 */

export type WeatherIconKind =
  | 'sun'
  | 'moon'
  | 'sun-cloud'
  | 'moon-cloud'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'fog'
  | 'cloud-drizzle'
  | 'freezing-rain'
  | 'cloud-rain'
  | 'cloud-rain-heavy'
  | 'cloud-snow'
  | 'cloud-snow-heavy'
  | 'snowflake'
  | 'cloud-lightning'
  | 'cloud-hail';

export interface WeatherPresentation {
  label: string;
  icon: WeatherIconKind;
  emoji: string;
}

export interface WeatherCondition {
  kind: WeatherIconKind;
  label: string;
}

/** Données minimales pour afficher la condition sur une carte (page club ou lien public). */
export interface EventWeatherDisplay {
  weatherCode: number;
  temperatureC: number | null;
  isDay?: boolean | null;
}

export type DayOrNight<T> = T | { day: T; night: T };

export interface WeatherCodeSpec {
  label: string;
  icon: DayOrNight<WeatherIconKind>;
  emoji: DayOrNight<string>;
}
