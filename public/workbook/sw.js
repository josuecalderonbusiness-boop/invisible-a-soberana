self.console.log('[SW] sw.js cargado correctamente');

// â”€â”€ Firebase Messaging (background) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Deep linking al tocar la notificaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Cache (PWA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CACHE_NAME = 'soberana-v361';
const urlsToCache = [
  '/workbook/',
  '/workbook/index.html',
  '/workbook/manifest.json',
  '/workbook/icon-192.png',
  '/workbook/icon-512.png',
  '/workbook/assets/gemas/copa-soberana.png',
  '/workbook/assets/gemas/gema-workshop.png',
  '/workbook/assets/gemas/gema-semana1.png',
  '/workbook/assets/gemas/gema-semana2.png',
  '/workbook/assets/gemas/gema-semana3.png',
  '/workbook/assets/gemas/gema-corona.png'
];

self.addEventListener('install', event => {
  self.console.log('[SW] install â€” cacheando recursos');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  self.console.log('[SW] activate â€” limpiando caches viejos');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Network First para index.html â€” siempre sirve versiÃ³n nueva si hay red
  if (req.url.includes('index.html') || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache First para el resto de assets
  event.respondWith(
    caches.match(req).then(response => response || fetch(req))
  );
});

