const APP_NOTIFICATION_URL = '/club/notifications';
const CACHE_NAME = 'planningclub-shell-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offlinePage = await caches.match(OFFLINE_URL);
        if (offlinePage) return offlinePage;

        return new Response(
          '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Hors ligne</title></head><body><p>Connexion indisponible.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }),
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  event.waitUntil(showPushNotification(event.data));
});

function assetUrl(path) {
  const origin = self.location && self.location.origin;
  if (typeof origin === 'string' && /^https?:\/\//.test(origin)) {
    return origin.replace(/\/$/, '') + path;
  }
  return path;
}

function isSafeIconUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return false;
    return url.pathname === '/api/pwa/icon' || url.pathname.startsWith('/branding/') || url.pathname.startsWith('/api/logo');
  } catch {
    return false;
  }
}

function notificationIcon(notification) {
  if (typeof notification.icon === 'string' && isSafeIconUrl(notification.icon)) {
    return new URL(notification.icon, self.location.origin).href;
  }

  const clubId = typeof notification.clubId === 'string' ? notification.clubId.trim() : '';
  if (/^[A-Za-z0-9_-]{1,64}$/.test(clubId)) {
    return assetUrl(`/api/pwa/icon?clubId=${encodeURIComponent(clubId)}&size=192&variant=plain`);
  }

  return assetUrl('/api/pwa/icon?clubId=clubika&size=192&variant=plain');
}

function resolveNotificationUrl(rawUrl) {
  const fallback = new URL(APP_NOTIFICATION_URL, self.location.origin).href;
  if (!rawUrl) return fallback;
  try {
    return new URL(rawUrl, self.location.origin).href;
  } catch {
    return fallback;
  }
}

function notificationOptions(notification) {
  const fallbackTag = [
    notification.type || 'notification',
    notification.eventType || '',
    notification.eventId || '',
  ].join(':');
  const icon = notificationIcon(notification);
  return {
    body: notification.message || 'Vous avez une nouvelle notification.',
    icon,
    image: icon,
    tag: notification.notificationId ? `notification:${notification.notificationId}` : fallbackTag,
    renotify: true,
    data: {
      url: resolveNotificationUrl(notification.url || notification.href),
      notificationId: notification.notificationId || notification.id,
    },
  };
}

async function showPushNotification(pushData) {
  if (pushData) {
    try {
      const notification = pushData.json();
      if (notification && typeof notification === 'object' && notification.notificationId) {
        await self.registration.showNotification(
          notification.title || 'Clubika',
          notificationOptions(notification),
        );
        return;
      }
    } catch (error) {
      console.error('Unable to decode push notification:', error);
    }
  }

  // Compatibilité avec les abonnements historiques sans clés de chiffrement : ces anciens
  // réveils sans payload continuent de fonctionner jusqu'au renouvellement de l'abonnement.
  await showLatestNotification();
}

async function showLatestNotification() {
  try {
    const response = await fetch('/api/notifications', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) return;

    const data = await response.json();
    const notification = Array.isArray(data.notifications) ? data.notifications[0] : null;
    if (!notification) return;

    await self.registration.showNotification(
      notification.title || 'Clubika',
      notificationOptions({ ...notification, notificationId: String(notification.id || '') }),
    );
  } catch (error) {
    console.error('Unable to display push notification:', error);
  }
}

async function openNotificationTarget(targetUrl) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if ('focus' in client) {
      if ('navigate' in client) {
        await client.navigate(targetUrl);
      }
      return client.focus();
    }
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }

  return undefined;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationUrl(event.notification.data?.url);

  event.waitUntil(openNotificationTarget(targetUrl));
});
