/* Bobblekolik Web Push & Firebase Cloud Messaging (FCM) Service Worker */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        notification: {
          title: 'Bobblekolik',
          body: event.data.text()
        }
      };
    }
  }

  const notificationData = payload.notification || {};
  const customData = payload.data || {};

  const title = notificationData.title || customData.title || 'Bobblekolik';
  const body = notificationData.body || customData.body || '';
  const icon = notificationData.icon || customData.icon || '/favicon.ico';
  const tag = customData.tag || notificationData.tag || 'bobblekolik-push';
  const url =
    customData.url ||
    (payload.fcmOptions && payload.fcmOptions.link) ||
    '/';

  const options = {
    body,
    icon,
    badge: icon,
    tag,
    renotify: true,
    vibrate: [180, 80, 180],
    data: {
      url,
      type: customData.type || 'general'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
