// GDF Progressive Web App Service Worker — Self-Updating Engine
const CACHE_NAME = 'gdf-quant-v75.0-unified-resilience';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/vendor-three.min.js?v=69.0',
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
// 1. /api/ requests: Bypass ServiceWorker interception completely
// 2. Navigation requests (App Shell / index.html): Network-First (with quick fallback to cache if offline)
// 3. Static assets: Stale-While-Revalidate (with MIME-type guard against HTML fallback poisoning)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

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
          return caches.match(req).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const ct = (networkResponse.headers.get('content-type') || '').toLowerCase();
          const isJsReq = url.pathname.endsWith('.js');
          if (!(isJsReq && ct.includes('text/html'))) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
