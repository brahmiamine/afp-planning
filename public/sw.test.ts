import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('service worker installability', () => {
  it('registers a fetch handler required for Android WebAPK install', () => {
    const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
    expect(source).toContain("addEventListener('fetch'");
    expect(source).toContain('event.respondWith');
    expect(source).toContain("const OFFLINE_URL = '/offline'");
  });
});

describe('service worker push correlation (issue #219)', () => {
  it('shows two distinct system notifications for two close push payloads', async () => {
    const listeners = new Map<string, (event: { data?: { json: () => unknown }; waitUntil: (promise: Promise<void>) => void }) => void>();
    const showNotification = vi.fn(async (..._args: unknown[]) => undefined);
    const fetch = vi.fn();
    const self = {
      addEventListener: (name: string, listener: (event: never) => void) => listeners.set(name, listener as never),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(), matchAll: vi.fn(), openWindow: vi.fn() },
      registration: { showNotification },
    };
    const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
    expect(source).toContain("const APP_NOTIFICATION_URL = '/club/notifications'");
    expect(source).not.toContain("const APP_NOTIFICATION_URL = '/notifications'");
    runInNewContext(source, { self, fetch, console });
    const push = listeners.get('push');
    if (!push) throw new Error('push listener missing');

    const pending: Promise<void>[] = [];
    const dispatch = (notificationId: string, title: string) => push({
      data: {
        json: () => ({
          notificationId,
          type: 'assignment',
          title,
          message: `Message ${notificationId}`,
          eventType: 'amical',
          eventId: 'match-1',
          url: '/club/notifications',
        }),
      },
      waitUntil: (promise) => pending.push(promise),
    });

    dispatch('delivery-1', 'Première');
    dispatch('delivery-2', 'Deuxième');
    await Promise.all(pending);

    expect(fetch).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledTimes(2);
    expect(showNotification.mock.calls.map(([, options]) => (options as { tag: string }).tag)).toEqual([
      'notification:delivery-1',
      'notification:delivery-2',
    ]);
  });

  it('uses the club-scoped icon endpoint when the payload carries a clubId', async () => {
    const listeners = new Map<string, (event: { data?: { json: () => unknown }; waitUntil: (promise: Promise<void>) => void }) => void>();
    const showNotification = vi.fn(async (..._args: unknown[]) => undefined);
    const fetch = vi.fn();
    const self = {
      addEventListener: (name: string, listener: (event: never) => void) => listeners.set(name, listener as never),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(), matchAll: vi.fn(), openWindow: vi.fn() },
      registration: { showNotification },
    };
    const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
    runInNewContext(source, { self, fetch, console });
    const push = listeners.get('push');
    if (!push) throw new Error('push listener missing');

    const pending: Promise<void>[] = [];
    push({
      data: {
        json: () => ({
          notificationId: 'delivery-3',
          type: 'assignment',
          title: 'Message de test1',
          message: 'nn',
          eventType: 'amical',
          eventId: 'match-1',
          url: '/club/notifications',
          clubId: 'us-biotoise',
        }),
      },
      waitUntil: (promise) => pending.push(promise),
    });
    await Promise.all(pending);

    expect(showNotification).toHaveBeenCalledTimes(1);
    const options = showNotification.mock.calls.map(([, opts]) => opts)[0] as { icon: string; badge: string };
    expect(options.icon).toBe('/api/pwa/icon?clubId=us-biotoise&size=192&variant=plain');
    expect(options.badge).toBe('/api/pwa/icon?clubId=us-biotoise&size=192&variant=plain&image=mono');
  });
});
