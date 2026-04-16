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

  const estilos = {
    novedades: {
      backgroundColor: '#0D2418',
      borderColor: 'rgba(93,170,127,0.35)',
      iconBg: 'linear-gradient(145deg, #1A3D2B, #2A5C42)',
      tagColor: '#5DAA7F',
      titleColor: '#EDE3CE',
      subColor: 'rgba(237,227,206,0.6)',
      timeColor: 'rgba(93,170,127,0.5)',
      appTag: 'Soberana · 7D Novedades'
    },
    sistema: {
      backgroundColor: '#1a0a0f',
      borderColor: 'rgba(139,26,47,0.5)',
      iconBg: 'linear-gradient(145deg, #3D0C11, #5C1020)',
      tagColor: 'rgba(212,168,67,0.8)',
      titleColor: '#F9F4EC',
      subColor: 'rgba(249,244,236,0.5)',
      timeColor: 'rgba(184,137,42,0.4)',
      appTag: 'Soberana · Sistema'
    },
    inactividad: {
      backgroundColor: '#B8892A',
      borderColor: 'none',
      iconBg: 'rgba(61,12,17,0.25)',
      tagColor: 'rgba(61,12,17,0.7)',
      titleColor: '#3D0C11',
      subColor: 'rgba(61,12,17,0.65)',
      timeColor: 'rgba(61,12,17,0.45)',
      appTag: 'Soberana · Alerta'
    }
  };

  messaging.onBackgroundMessage(payload => {
    self.console.log('[SW] onBackgroundMessage recibido:', payload);
    const d = payload.data || {};
    const tipo = d.tipo || 'novedades';
    const estilo = estilos[tipo] || estilos.novedades;

    const options = {
      body: d.body,
      icon: d.icon || '/workbook/icons/icon-192.png',
      badge: d.badge || '/workbook/icons/badge-72.png',
      tag: d.tag || tipo,
      renotify: true,
      silent: tipo !== 'inactividad',
      vibrate: tipo === 'inactividad' ? [200, 100, 200] : [100],
      data: { url: d.url || '/workbook/', estilo }
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
