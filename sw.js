const CACHE_NAME = 'sql-dungeons-v1';
const ASSETS = [
  './',
  './index.html',
  './assets/css/styles.css',
  './assets/js/main.js',
  './assets/js/lang/i18n-init.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first, fallback to cache
  event.respondWith(
    fetch(event.request).then((res) => {
      // put a clone in cache for future
      try { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, copy)); } catch(e) {}
      return res;
    }).catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
  );
});
