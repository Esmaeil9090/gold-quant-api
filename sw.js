const SW_RELEASE_VERSION = '2026.10.27-v80.0-ScientificLatentCoreAndPulseEchoSonar';
let ACTIVE_CACHE_NAME = `gdf-quant-${SW_RELEASE_VERSION}`;

const REQUIRED_STATIC_ASSETS = [
  '/',
  '/index.html',
  '/js/gdfClientCore.js',
];

const OPTIONAL_STATIC_ASSETS = [
  '/manifest.webmanifest',
];

async function isCacheVerifiedComplete(cacheName) {
  if (!cacheName || typeof cacheName !== 'string' || !cacheName.startsWith('gdf-quant-')) {
    return false;
  }
  try {
    const hasCache = await caches.has(cacheName);
    if (!hasCache) return false;
    const cache = await caches.open(cacheName);
    const indexRes = await cache.match('/index.html');
    const coreRes = await cache.match('/js/gdfClientCore.js');
    return Boolean(indexRes && indexRes.status === 200 && coreRes && coreRes.status === 200);
  } catch (_) {
    return false;
  }
}

async function resolveBestVerifiedCacheName() {
  if (await isCacheVerifiedComplete(ACTIVE_CACHE_NAME)) {
    return ACTIVE_CACHE_NAME;
  }
  try {
    const keys = await caches.keys();
    const quantKeys = keys.filter((k) => k.startsWith('gdf-quant-')).sort().reverse();
    for (const k of quantKeys) {
      if (await isCacheVerifiedComplete(k)) {
        ACTIVE_CACHE_NAME = k;
        return k;
      }
    }
  } catch (_) {}
  return ACTIVE_CACHE_NAME;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const stageInstallCacheName = `gdf-client-stage-sw-install-${SW_RELEASE_VERSION}`;
      try {
        const stageCache = await caches.open(stageInstallCacheName);
        const downloadedRequired = [];

        for (const url of REQUIRED_STATIC_ASSETS) {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res || !res.ok || res.status !== 200) {
            throw new Error(`Required install asset ${url} failed with status ${res ? res.status : 'NO_RESPONSE'}`);
          }
          const bodyText = await res.text();
          if (!bodyText || bodyText.length === 0) {
            throw new Error(`Required install asset ${url} returned empty body`);
          }
          const headers = new Headers(res.headers);
          await stageCache.put(url, new Response(bodyText, { status: 200, headers }));
          downloadedRequired.push({ url, bodyText, headers });
        }

        for (const optUrl of OPTIONAL_STATIC_ASSETS) {
          try {
            const optRes = await fetch(optUrl, { cache: 'no-store' });
            if (optRes && optRes.ok) {
              await stageCache.put(optUrl, optRes.clone());
            }
          } catch (_) {}
        }

        const activeCache = await caches.open(ACTIVE_CACHE_NAME);
        for (const item of downloadedRequired) {
          await activeCache.put(
            item.url,
            new Response(item.bodyText, { status: 200, headers: new Headers(item.headers) })
          );
        }

        for (const optUrl of OPTIONAL_STATIC_ASSETS) {
          const stagedOpt = await stageCache.match(optUrl);
          if (stagedOpt) {
            await activeCache.put(optUrl, stagedOpt.clone());
          }
        }

        await caches.delete(stageInstallCacheName);
        await self.skipWaiting();
      } catch (err) {
        try {
          await caches.delete(stageInstallCacheName);
        } catch (_) {}
        throw err;
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const activeIsComplete = await isCacheVerifiedComplete(ACTIVE_CACHE_NAME);
      const cacheNames = await caches.keys();

      if (activeIsComplete) {
        // Delete only obsolete gdf-quant-* caches after verifying ACTIVE_CACHE_NAME is complete.
        // Never delete in-flight gdf-client-stage-* caches.
        await Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName.startsWith('gdf-quant-') &&
              cacheName !== ACTIVE_CACHE_NAME
            ) {
              return caches.delete(cacheName);
            }
            return Promise.resolve(false);
          })
        );
      } else {
        // Preserve the last working cache if ACTIVE_CACHE_NAME is not verified complete
        await resolveBestVerifiedCacheName();
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  const targetCache =
    typeof data.cacheName === 'string' && data.cacheName.trim()
      ? data.cacheName.trim()
      : typeof data.activeCacheName === 'string' && data.activeCacheName.trim()
      ? data.activeCacheName.trim()
      : '';

  if (data.type === 'ACTIVATE_VERIFIED_RELEASE' && targetCache.startsWith('gdf-quant-')) {
    event.waitUntil(
      (async () => {
        const verified = await isCacheVerifiedComplete(targetCache);
        if (!verified) {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
              ok: false,
              reason: `Target cache ${targetCache} is missing required verified client assets`,
              activeCacheName: ACTIVE_CACHE_NAME,
            });
          }
          return;
        }

        const preserveCache =
          typeof data.preserveFallbackCacheName === 'string' ? data.preserveFallbackCacheName : null;
        ACTIVE_CACHE_NAME = targetCache;

        if (data.pruneObsolete !== false) {
          const keys = await caches.keys();
          await Promise.all(
            keys.map((k) => {
              if (
                k.startsWith('gdf-quant-') &&
                k !== ACTIVE_CACHE_NAME &&
                k !== preserveCache
              ) {
                return caches.delete(k);
              }
              return Promise.resolve(false);
            })
          );
        }

        await self.clients.claim();
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            ok: true,
            activeCacheName: ACTIVE_CACHE_NAME,
          });
        }
      })()
    );
    return;
  }

  if (data.type === 'ROLLBACK_BROKEN_RELEASE') {
    const brokenCache = typeof data.brokenCacheName === 'string' ? data.brokenCacheName : '';
    const fallbackCache = typeof data.fallbackCacheName === 'string' ? data.fallbackCacheName : '';
    event.waitUntil(
      (async () => {
        if (brokenCache && brokenCache.startsWith('gdf-quant-')) {
          await caches.delete(brokenCache);
        }
        if (fallbackCache && (await isCacheVerifiedComplete(fallbackCache))) {
          ACTIVE_CACHE_NAME = fallbackCache;
        } else {
          await resolveBestVerifiedCacheName();
        }
        await self.clients.claim();
      })()
    );
    return;
  }

  if (data.type === 'GET_SW_VERSION' && event.ports && event.ports[0]) {
    event.waitUntil(
      (async () => {
        const resolved = await resolveBestVerifiedCacheName();
        event.ports[0].postMessage({
          swVersion: SW_RELEASE_VERSION,
          activeCacheName: resolved,
        });
      })()
    );
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache live market API or release manifest calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML/JS/SW navigation & client shell, falling back to verified active cache when offline
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          resolveBestVerifiedCacheName().then((cacheName) => {
            caches.open(cacheName).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const bestCacheName = await resolveBestVerifiedCacheName();
        const activeCache = await caches.open(bestCacheName);
        const exactMatch =
          (await activeCache.match(event.request, { ignoreSearch: true })) ||
          (await caches.match(event.request, { ignoreSearch: true }));
        if (exactMatch) {
          return exactMatch;
        }
        const isNavigation =
          event.request.mode === 'navigate' ||
          url.pathname === '/' ||
          url.pathname === '/index.html';
        if (isNavigation) {
          const fallbackHtml =
            (await activeCache.match('/index.html')) ||
            (await activeCache.match('/')) ||
            (await caches.match('/index.html'));
          if (fallbackHtml) {
            return fallbackHtml;
          }
        }
        return new Response('Offline asset unavailable in verified GDF cache', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
