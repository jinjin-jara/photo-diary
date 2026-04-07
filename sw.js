const CACHE_NAME = 'diary-v8';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/auth.js',
  './js/db.js',
  './js/couple.js',
  './js/image.js',
  './js/router.js',
  './js/pages/login.js',
  './js/pages/couple-link.js',
  './js/pages/feed.js',
  './js/pages/detail.js',
  './js/pages/write.js',
  './js/pages/my.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Firestore API — network only
  if (e.request.url.includes('firestore.googleapis.com')) return;

  // Firebase Storage images — cache first
  if (e.request.url.includes('firebasestorage.googleapis.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // App assets — network first, cache fallback
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
