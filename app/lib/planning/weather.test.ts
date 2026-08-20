import { describe, expect, it } from 'vitest';
import { parseOpenMeteoForecast } from './weather';

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
