import { describe, expect, it } from 'vitest';
import { OPEN_METEO_WEATHER_CODES, WEATHER_CODE_CATALOG } from './weather-codes';
import { getWeatherPresentation } from './weather-mapper';

describe('getWeatherPresentation', () => {
  it('couvre tous les codes WMO Open-Meteo documentés', () => {
    for (const code of OPEN_METEO_WEATHER_CODES) {
      const spec = WEATHER_CODE_CATALOG[code];
      const day = getWeatherPresentation(code, true);
      expect(day.label).toBe(spec.label);
      expect(day.icon).toBeTruthy();
      expect(day.emoji).toBeTruthy();
    }
  });

  it('distingue jour et nuit pour les codes 0, 1 et 2', () => {
    expect(getWeatherPresentation(0, true)).toEqual({ label: 'Ciel dégagé', icon: 'sun', emoji: '☀️' });
    expect(getWeatherPresentation(0, false)).toEqual({ label: 'Ciel dégagé', icon: 'moon', emoji: '🌙' });

    expect(getWeatherPresentation(1, true)).toEqual({
      label: 'Principalement dégagé',
      icon: 'sun-cloud',
      emoji: '🌤️',
    });
    expect(getWeatherPresentation(1, false)).toEqual({
      label: 'Principalement dégagé',
      icon: 'moon-cloud',
      emoji: '🌤️',
    });

    expect(getWeatherPresentation(2, true)).toEqual({
      label: 'Partiellement nuageux',
      icon: 'cloud-sun',
      emoji: '⛅',
    });
    expect(getWeatherPresentation(2, false)).toEqual({
      label: 'Partiellement nuageux',
      icon: 'cloud-moon',
      emoji: '⛅',
    });
  });

  it('garde la même icône jour/nuit pour pluie, neige, brouillard et orage', () => {
    for (const code of [3, 45, 48, 61, 71, 95] as const) {
      expect(getWeatherPresentation(code, true).icon).toBe(getWeatherPresentation(code, false).icon);
    }
  });

  it('renvoie le fallback pour un code inconnu, NaN ou non fini', () => {
    const fallback = {
      label: 'Conditions météo inconnues',
      icon: 'cloud',
      emoji: '☁️',
    };
    expect(getWeatherPresentation(999, true)).toEqual(fallback);
    expect(getWeatherPresentation(Number.NaN, true)).toEqual(fallback);
    expect(getWeatherPresentation(Number.POSITIVE_INFINITY, false)).toEqual(fallback);
  });

  it('ne déduit jamais la condition à partir de la température : seul weather_code compte', () => {
    expect(getWeatherPresentation(0, true).label).toBe('Ciel dégagé');
    expect(getWeatherPresentation(65, true).label).toBe('Forte pluie');
    expect(getWeatherPresentation(75, true).label).toBe('Forte neige');
  });

  it('traite isDay null/undefined comme le jour', () => {
    expect(getWeatherPresentation(0).icon).toBe('sun');
    expect(getWeatherPresentation(0, null).icon).toBe('sun');
  });
});
