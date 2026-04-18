self.console.log('[SW] sw.js cargado correctamente');

// ── Firebase Messaging (background) ──────────────────────────────
try {
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
  self.console.log('[SW] firebase-app-compat cargado');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
  self.console.log('[SW] firebase-messaging-compat cargado');

  firebase.initializeApp({
    apiKey: "AIzaSyB7-A43AHuHDERC-ZdEyFRZ5R2w6w_rRYo",
    authDomain: "soberana-app.firebaseapp.com",
    projectId: "soberana-app",
    storageBucket: "soberana-app.firebasestorage.app",
    messagingSenderId: "30025552803",
    appId: "1:30025552803:web:eb47af86c1898b99e94016"
  });
  self.console.log('[SW] Firebase inicializado');

  const messaging = firebase.messaging();
  self.console.log('[SW] firebase.messaging() OK');

  messaging.onBackgroundMessage((payload) => {
    self.console.log('[SW] onBackgroundMessage recibido:', payload);
    const d = payload.data || {};
    const tipo = d.tipo || 'novedades';

    const options = {
      body: d.body,
      icon: '/workbook/icon-192.png',
      badge: '/workbook/icon-192.png',
      tag: d.tag || tipo,
      vibrate: [200, 100, 200],
      data: { url: d.url || '/workbook/' }
    };

    return self.registration.showNotification(d.title || 'Soberana', options);
  });

} catch (e) {
  self.console.error('[SW] Error inicializando Firebase:', e);
}

// ── Deep linking al tocar la notificación ────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/workbook/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/workbook') && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Cache (PWA) ───────────────────────────────────────────────────
const CACHE_NAME = 'soberana-v26';
const urlsToCache = [
  '/workbook/',
  '/workbook/index.html',
  '/workbook/manifest.json',
  '/workbook/icon-192.png',
  '/workbook/icon-512.png'
];

self.addEventListener('install', event => {
  self.console.log('[SW] install — cacheando recursos');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  self.console.log('[SW] activate — limpiando caches viejos');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
