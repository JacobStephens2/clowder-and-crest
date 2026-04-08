// Service Worker for Clowder & Crest web build.
//
// Strategy:
//   - HTML / navigation requests: network-first, fall back to cached index
//     when offline. This means the player always gets the freshest game
//     code when online but can still play offline if they've loaded the
//     site at least once.
//   - Everything else (JS bundles, CSS, assets): cache-first. The build
//     hashes filenames so a fresh build invalidates old caches naturally.
//   - Audio (.mp3): cache-first with stale-while-revalidate semantics —
//     these are large and rarely change.
//
// Cache name is versioned so a SW update wipes old caches cleanly.
// Bump CACHE_VERSION when you want every client to refresh from network.

const CACHE_VERSION = 'v1-2026-04-08';
const RUNTIME_CACHE = `clowder-runtime-${CACHE_VERSION}`;
const STATIC_CACHE = `clowder-static-${CACHE_VERSION}`;

// Files we want available immediately on first install. Keep this list
// short — we don't pre-cache assets here because the build hashes their
// names and we don't know the exact filenames at SW author time. The
// runtime fetch handler will populate the cache as the player plays.
const ESSENTIAL_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ESSENTIAL_PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Sweep old caches whenever a new SW activates.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== RUNTIME_CACHE && n !== STATIC_CACHE)
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only cache same-origin requests; let cross-origin (analytics, fonts)
  // hit the network as normal.
  if (url.origin !== self.location.origin) return;

  // HTML / navigation: network-first
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  // Everything else: cache-first, fall through to network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Only cache successful, basic-type responses
        if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
        const clone = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
        return resp;
      }).catch(() => {
        // Offline + not cached → return whatever the cache has, or nothing
        return caches.match(req);
      });
    }),
  );
});

// Allow main thread to trigger an immediate update via postMessage
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
