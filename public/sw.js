const APP_NOTIFICATION_URL = '/notifications';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(showLatestNotification());
});

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

    const tagParts = [
      notification.type || 'notification',
      notification.eventType || '',
      notification.eventId || String(notification.id || ''),
    ];

    await self.registration.showNotification(notification.title || 'AFP Planning', {
      body: notification.message || 'Vous avez une nouvelle notification.',
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      tag: tagParts.join(':'),
      renotify: true,
      data: {
        url: APP_NOTIFICATION_URL,
        notificationId: notification.id,
      },
    });
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
