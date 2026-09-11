const APP_NOTIFICATION_URL = '/club/notifications';
const CLUBIKA_NOTIFICATION_ICON = '/branding/clubika-icon.png';
const CLUBIKA_APP_ICON = '/branding/icon.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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

function notificationIcon(_notification) {
  return assetUrl(CLUBIKA_NOTIFICATION_ICON);
}

function notificationBadge() {
  return assetUrl(CLUBIKA_APP_ICON);
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
    badge: notificationBadge(),
    tag: notification.notificationId ? `notification:${notification.notificationId}` : fallbackTag,
    renotify: true,
    data: {
      url: notification.url || APP_NOTIFICATION_URL,
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || APP_NOTIFICATION_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
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
    }),
  );
});
