import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();

vi.mock('@/lib/utils/api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
}));

describe('loadEventWeather', () => {
  afterEach(async () => {
    apiGet.mockReset();
    const { resetEventWeatherCache } = await import('./useEventWeather');
    resetEventWeatherCache();
  });

  it('réutilise la prévision en cache pour le même événement', async () => {
    apiGet.mockResolvedValue({
      available: true,
      weatherCode: 3,
      temperatureC: 17,
      precipitationProbability: 0,
      windGustKmh: 10,
      severity: 'normal',
    });

    const { loadEventWeather } = await import('./useEventWeather');
    const first = await loadEventWeather('officiel', 'match-1');
    const second = await loadEventWeather('officiel', 'match-1');

    expect(first).toEqual(expect.objectContaining({ weatherCode: 3, temperatureC: 17 }));
    expect(second).toBe(first);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/api/planning/weather?eventType=officiel&eventId=match-1');
  });

  it('ne met pas en cache un échec, pour réessayer au prochain appel', async () => {
    apiGet.mockRejectedValueOnce(new Error('désactivé')).mockResolvedValueOnce({
      available: true,
      weatherCode: 0,
      temperatureC: 22,
      precipitationProbability: 5,
      windGustKmh: 8,
      severity: 'normal',
    });

    const { loadEventWeather } = await import('./useEventWeather');
    expect(await loadEventWeather('amical', 'friendly-1')).toBeNull();
    const retry = await loadEventWeather('amical', 'friendly-1');

    expect(retry).toEqual(expect.objectContaining({ weatherCode: 0, temperatureC: 22 }));
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
