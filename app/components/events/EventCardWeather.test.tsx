import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventCardWeather } from './EventCardWeather';
import { OPEN_METEO_WEATHER_CODES } from '@/lib/planning/weather-codes';
import { WeatherConditionIcon } from './WeatherConditionIcon';
import { getWeatherPresentation } from '@/lib/planning/weather-mapper';

vi.mock('@/hooks/useEventWeather', () => ({
  useEventWeather: () => null,
}));

describe('EventCardWeather', () => {
  it('n’affiche rien si la prévision est absente', () => {
    const html = renderToStaticMarkup(<EventCardWeather weather={null} />);
    expect(html).toBe('');
  });

  it('reste affichable pour un code inconnu', () => {
    const html = renderToStaticMarkup(
      <EventCardWeather weather={{ weatherCode: 999, temperatureC: 12, isDay: true }} />,
    );
    expect(html).toContain('Conditions météo inconnues');
    expect(html).toContain('12 °C');
  });
});

describe('WeatherConditionIcon', () => {
  it('rend une icône SVG pour chaque code WMO, jour et nuit', () => {
    for (const code of OPEN_METEO_WEATHER_CODES) {
      for (const isDay of [true, false]) {
        const presentation = getWeatherPresentation(code, isDay);
        const html = renderToStaticMarkup(
          <WeatherConditionIcon kind={presentation.icon} label={presentation.label} />,
        );
        expect(html).toContain('<svg');
        expect(html).toContain(`aria-label="${presentation.label}"`);
      }
    }
  });
});
