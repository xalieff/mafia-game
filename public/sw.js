/**
 * Mafia – service worker
 *
 * Purpose: make the app installable and let the app shell (the page, manifest
 * and icons) open instantly, even on a flaky connection.
 *
 * What it does NOT do: touch real-time traffic. Any request whose URL contains
 * "/socket.io/" is returned to the browser untouched, before any other logic
 * runs, so multiplayer connections are never cached, delayed or interrupted.
 * The same goes for the small JSON API (/api/) and /health, which must always
 * be live.
 *
 * Strategies:
 *   - Page navigations ("/", "/index.html", "/room/ABCD" invite links):
 *     network first, so players always get the latest version; the cached
 *     copy is only a fallback when the network fails.
 *   - Manifest and icons: stale-while-revalidate.
 *
 * To force every client to drop old caches after a release, bump VERSION.
 */

'use strict';

const VERSION = 'v1';
const CACHE_PREFIX = 'mafia-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// Must be cacheable, otherwise installation fails and is retried later.
const CORE_ASSETS = ['/', '/index.html', '/manifest.json'];
// Nice to have; a missing icon must not block installation.
const OPTIONAL_ASSETS = ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

const STATIC_PATHS = new Set([...CORE_ASSETS, ...OPTIONAL_ASSETS]);

/* ───────────────────────────── Install ───────────────────────────── */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // `reload` skips the browser HTTP cache so we never store a stale copy.
    await cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await Promise.allSettled(
      OPTIONAL_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
    );
    await self.skipWaiting();
  })());
});

/* ───────────────────────────── Activate ───────────────────────────── */

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

/* ───────────────────────────── Fetch ───────────────────────────── */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Socket.io traffic bypasses the service worker completely.
  //    (No respondWith() call means the browser handles it as if no SW existed.)
  if (request.url.includes('/socket.io/')) return;

  // 2. Only handle plain same-origin GETs.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 3. Live data is never cached.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return;

  // 4. Pages: network first, cached shell as offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event));
    return;
  }

  // 5. Manifest and icons: serve from cache, refresh in the background.
  if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // Anything else falls through to the network untouched.
});

/** Pages the server answers with index.html (see the /room/:code route). */
function isShellPath(pathname) {
  return pathname === '/' || pathname === '/index.html' || pathname.startsWith('/room/');
}

async function networkFirstPage(event) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && isShellPath(new URL(request.url).pathname)) {
      // Keep the offline copy fresh without delaying the response.
      const forRoot = response.clone();
      const forIndex = response.clone();
      event.waitUntil(Promise.all([
        cache.put('/', forRoot),
        cache.put('/index.html', forIndex),
      ]));
    }
    return response;
  } catch (err) {
    const fallback = (await cache.match('/index.html')) || (await cache.match('/'));
    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}
