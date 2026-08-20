import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from './settings';

describe('normalizeAppSettings planning features', () => {
  it('keeps safe defaults when feature settings are missing', () => {
    const settings = normalizeAppSettings({ clubName: 'AFP' });

    expect(settings.features).toEqual(DEFAULT_APP_SETTINGS.features);
    expect(settings.timeZone).toBe(DEFAULT_APP_SETTINGS.timeZone);
  });

  it('preserves explicit feature switches and rejects non booleans', () => {
    const settings = normalizeAppSettings({
      features: {
        recurringEvents: false,
        scraperSync: false,
        eventChat: 'false',
      },
    });

    expect(settings.features.recurringEvents).toBe(false);
    expect(settings.features.scraperSync).toBe(false);
    expect(settings.features.eventChat).toBe(DEFAULT_APP_SETTINGS.features.eventChat);
  });

  it('falls back when the configured time zone is invalid', () => {
    expect(normalizeAppSettings({ timeZone: 'Europe/Paris' }).timeZone).toBe('Europe/Paris');
    expect(normalizeAppSettings({ timeZone: 'Mars/Olympus' }).timeZone).toBe(DEFAULT_APP_SETTINGS.timeZone);
  });
});
