// GDF Progressive Web App Service Worker — Self-Updating Engine
const CACHE_NAME = 'gdf-quant-v68.0';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/vendor-three.min.js',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg'
];

// Install: Precache shell and skip waiting immediately to activate new version
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Precache notice:', err);
      });
    })
  );
});

// Activate: Take immediate control of all open windows & purge obsolete cache stores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[GDF ServiceWorker] Purging stale cache store:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message listener: Allows client to trigger skipWaiting or force refresh
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Strategy:
// 1. Navigation requests (App Shell / index.html): Network-First (with quick fallback to cache if offline)
//    This guarantees that whenever an update is pushed, the user gets the fresh code immediately!
// 2. /api/ requests: Network-First
// 3. Static assets: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests
  if (req.method !== 'GET') return;

  // 1. Navigation (App Shell / index.html) -> Network-First with timeout
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline, serve from cache
          return caches.match(req).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // 2. Live Quant API Requests -> Strictly Network-Only (Never cache volatile market spot data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
    );
    return;
  }

  // 3. Static assets & Icons -> Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
