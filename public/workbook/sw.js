// ── Firebase Messaging (background) ──────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB7-A43AHuHDERC-ZdEyFRZ5R2w6w_rRYo",
  authDomain: "soberana-app.firebaseapp.com",
  projectId: "soberana-app",
  storageBucket: "soberana-app.firebasestorage.app",
  messagingSenderId: "30025552803",
  appId: "1:30025552803:web:eb47af86c1898b99e94016"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title = 'Código Soberana', body = '' } = payload.notification || {};
  self.registration.showNotification(title, {
    body,
    icon: '/workbook/icon-192.png',
    badge: '/workbook/icon-192.png',
    data: payload.data || {}
  });
});

// ── Cache (PWA) ───────────────────────────────────────────────────
const CACHE_NAME = 'soberana-v2';
const urlsToCache = [
  '/workbook/',
  '/workbook/index.html',
  '/workbook/manifest.json',
  '/workbook/icon-192.png',
  '/workbook/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
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
