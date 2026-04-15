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

  messaging.onBackgroundMessage(payload => {
    self.console.log('[SW] onBackgroundMessage recibido:', payload);
    const { title = 'Código Soberana', body = '' } = payload.notification || {};
    self.registration.showNotification(title, {
      body,
      icon:  '/workbook/icon-192.png',
      badge: '/workbook/icon-192.png',
      data:  payload.data || {}
    });
  });

} catch (e) {
  self.console.error('[SW] Error inicializando Firebase:', e);
}

// ── Cache (PWA) ───────────────────────────────────────────────────
const CACHE_NAME = 'soberana-v3';
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
