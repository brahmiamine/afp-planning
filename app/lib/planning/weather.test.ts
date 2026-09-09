import { describe, expect, it, vi } from 'vitest';
import { cityFromAddress, geocodeLocation, parseOpenMeteoForecast, weatherGeocodeCandidates } from './weather';

describe('weather location fallback', () => {
  it('extrait la commune d’une adresse postale française', () => {
    expect(cityFromAddress('2 Rue Jean Cocteau, 75018 Paris')).toBe('Paris');
    expect(cityFromAddress('Stade des Poissonniers, 75018 Paris 18e')).toBe('Paris 18e');
    expect(cityFromAddress('12 av. du Général Leclerc, 92100 Boulogne-Billancourt')).toBe('Boulogne-Billancourt');
  });

  it('propose des lieux du plus précis au plus large, ville comprise', () => {
    const candidates = weatherGeocodeCandidates({
      location: 'Stade des Poissonniers',
      event: { details: { stadium: 'Stade des Poissonniers', address: '2 Rue Jean Cocteau, 75018 Paris' } },
    } as Parameters<typeof weatherGeocodeCandidates>[0]);
    expect(candidates).toEqual([
      'Stade des Poissonniers',
      '2 Rue Jean Cocteau, 75018 Paris',
      'Paris',
    ]);
  });
});

describe('planning weather', () => {
  it('returns a severe alert for thunderstorms and strong gusts near event time', () => {
    const result = parseOpenMeteoForecast({
      hourly: {
        time: ['2026-08-23T14:00', '2026-08-23T15:00'],
        weather_code: [3, 95],
        temperature_2m: [28, 27],
        precipitation_probability: [20, 90],
        wind_gusts_10m: [25, 75],
      },
    }, '2026-08-23T15:00');

    expect(result).toEqual(expect.objectContaining({
      available: true,
      severity: 'severe',
      weatherCode: 95,
      precipitationProbability: 90,
      windGustKmh: 75,
    }));
    expect(result.available).toBe(true);
    if (!result.available) throw new Error('Expected an available weather forecast');
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it('degrades to unavailable for malformed provider data', () => {
    expect(parseOpenMeteoForecast({}, '2026-08-23T15:00')).toEqual({ available: false, reason: 'forecast-unavailable' });
  });
});

describe('geocodeLocation — cache applicatif court (issue #222)', () => {
  it('ne rappelle pas le fournisseur de géocodage pour un même lieu dans la fenêtre de cache', async () => {
    const location = `Stade de test ${Math.random()}`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ latitude: 48.85, longitude: 2.35 }] }),
    } as Response);

    try {
      const first = await geocodeLocation(location);
      const second = await geocodeLocation(location);

      expect(first).toEqual({ lat: 48.85, lon: 2.35 });
      expect(second).toEqual({ lat: 48.85, lon: 2.35 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('interroge de nouveau le fournisseur pour un lieu différent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ latitude: 43.6, longitude: 1.44 }] }),
    } as Response);

    try {
      await geocodeLocation(`Lieu A ${Math.random()}`);
      await geocodeLocation(`Lieu B ${Math.random()}`);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
