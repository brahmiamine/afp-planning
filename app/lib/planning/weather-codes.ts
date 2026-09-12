/**
 * Catalogue des codes WMO documentés par Open-Meteo.
 * https://open-meteo.com/en/docs — Weather interpretation codes.
 * Aucun code inventé : uniquement ceux listés par le fournisseur.
 */

import type { WeatherCodeSpec, WeatherPresentation } from './weather-types';

export const OPEN_METEO_WEATHER_CODES = [
  0, 1, 2, 3,
  45, 48,
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  71, 73, 75, 77,
  80, 81, 82, 85, 86,
  95, 96, 99,
] as const;

export type OpenMeteoWeatherCode = (typeof OPEN_METEO_WEATHER_CODES)[number];

export const UNKNOWN_WEATHER_PRESENTATION: WeatherPresentation = {
  label: 'Conditions météo inconnues',
  icon: 'cloud',
  emoji: '☁️',
};

export const WEATHER_CODE_CATALOG: Record<OpenMeteoWeatherCode, WeatherCodeSpec> = {
  0: {
    label: 'Ciel dégagé',
    icon: { day: 'sun', night: 'moon' },
    emoji: { day: '☀️', night: '🌙' },
  },
  1: {
    label: 'Principalement dégagé',
    icon: { day: 'sun-cloud', night: 'moon-cloud' },
    emoji: '🌤️',
  },
  2: {
    label: 'Partiellement nuageux',
    icon: { day: 'cloud-sun', night: 'cloud-moon' },
    emoji: '⛅',
  },
  3: { label: 'Couvert', icon: 'cloud', emoji: '☁️' },
  45: { label: 'Brouillard', icon: 'fog', emoji: '🌫️' },
  48: { label: 'Brouillard givrant', icon: 'fog', emoji: '🌫️' },
  51: { label: 'Bruine légère', icon: 'cloud-drizzle', emoji: '🌦️' },
  53: { label: 'Bruine modérée', icon: 'cloud-drizzle', emoji: '🌦️' },
  55: { label: 'Bruine forte', icon: 'cloud-drizzle', emoji: '🌦️' },
  56: { label: 'Bruine verglaçante légère', icon: 'freezing-rain', emoji: '🧊' },
  57: { label: 'Bruine verglaçante forte', icon: 'freezing-rain', emoji: '🧊' },
  61: { label: 'Pluie légère', icon: 'cloud-rain', emoji: '🌧️' },
  63: { label: 'Pluie modérée', icon: 'cloud-rain', emoji: '🌧️' },
  65: { label: 'Forte pluie', icon: 'cloud-rain-heavy', emoji: '🌧️' },
  66: { label: 'Pluie verglaçante légère', icon: 'freezing-rain', emoji: '🧊' },
  67: { label: 'Forte pluie verglaçante', icon: 'freezing-rain', emoji: '🧊' },
  71: { label: 'Neige légère', icon: 'cloud-snow', emoji: '🌨️' },
  73: { label: 'Neige modérée', icon: 'cloud-snow', emoji: '🌨️' },
  75: { label: 'Forte neige', icon: 'cloud-snow-heavy', emoji: '❄️' },
  77: { label: 'Grains de neige', icon: 'snowflake', emoji: '❄️' },
  80: { label: 'Averses légères', icon: 'cloud-drizzle', emoji: '🌦️' },
  81: { label: 'Averses modérées', icon: 'cloud-rain', emoji: '🌧️' },
  82: { label: 'Averses violentes', icon: 'cloud-rain-heavy', emoji: '⛈️' },
  85: { label: 'Averses de neige légères', icon: 'cloud-snow', emoji: '🌨️' },
  86: { label: 'Fortes averses de neige', icon: 'cloud-snow-heavy', emoji: '❄️' },
  95: { label: 'Orage', icon: 'cloud-lightning', emoji: '⛈️' },
  96: { label: 'Orage avec grêle légère', icon: 'cloud-hail', emoji: '🌩️' },
  99: { label: 'Orage avec forte grêle', icon: 'cloud-hail', emoji: '🌩️' },
};
