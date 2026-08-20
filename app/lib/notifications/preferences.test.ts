import { describe, expect, it } from 'vitest';
import { normalizeNotificationPreferences, selectedNotificationChannels } from './preferences';

describe('notification preferences', () => {
  it('defaults to durable in-app plus push/email and leaves WhatsApp opt-in', () => {
    const preferences = normalizeNotificationPreferences(null);
    expect(preferences).toMatchObject({ inApp: true, push: true, email: true, whatsapp: false });
    expect(selectedNotificationChannels(preferences, { urgency: 'normal', eventType: 'officiel' })).toEqual(['inApp', 'push', 'email']);
  });

  it('applies urgency threshold and event type filters to secondary channels', () => {
    const preferences = normalizeNotificationPreferences({
      inApp: true,
      push: true,
      email: false,
      whatsapp: true,
      urgencyThreshold: 'important',
      eventTypes: ['officiel'],
    });
    expect(selectedNotificationChannels(preferences, { urgency: 'normal', eventType: 'officiel' })).toEqual(['inApp']);
    expect(selectedNotificationChannels(preferences, { urgency: 'critical', eventType: 'officiel' })).toEqual(['inApp', 'push', 'whatsapp']);
    expect(selectedNotificationChannels(preferences, { urgency: 'critical', eventType: 'plateau' })).toEqual(['inApp']);
  });
});
