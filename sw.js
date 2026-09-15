'use strict';

const CACHE_NAME = 'cps-portal-shell-v0.4.0';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/session-core.js',
  '/search-core.js',
  '/identity.js',
  '/offline.js',
  '/logbook.js',
  '/app.js',
  '/workbook.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const wbRes = await fetch('/workbook.json');
      if (!wbRes.ok) throw new Error('Failed to fetch workbook for cache');
      const wbClone = wbRes.clone();
      let isValidWb = false;
      try {
        const data = await wbClone.json();
        if (data && typeof data === 'object' && data['Morning Report'] && Array.isArray(data['Morning Report'].records)) {
          isValidWb = true;
        }
      } catch {}
      if (!isValidWb) {
        throw new Error('Incompatible or invalid workbook snapshot: aborting service worker installation');
      }

      await cache.put('/workbook.json', wbRes);
      const otherAssets = SHELL_ASSETS.filter((a) => a !== '/workbook.json');
      await cache.addAll(otherAssets);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('cps-portal-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isNonCachable(req, url) {
  if (req.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  const path = url.pathname.toLowerCase();
  if (path.startsWith('/api/') || path === '/api') return true;
  if (path.includes('logbook') && (path.endsWith('.json') || path.includes('private'))) return true;
  if (path.includes('backup') || path.includes('export')) return true;
  if (path.includes('credentials') || path.includes('auth')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (isNonCachable(req, url)) {
    return;
  }

  if (url.pathname === '/workbook.json') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          const networkRes = await fetch(req, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkRes.ok) {
            const clone = networkRes.clone();
            try {
              const data = await clone.json();
              if (data && typeof data === 'object' && data['Morning Report']) {
                await cache.put(req, networkRes.clone());
                return networkRes;
              }
            } catch {}
          }
        } catch {}

        const cached = await cache.match(req);
        if (cached) {
          const headers = new Headers(cached.headers);
          headers.set('X-CPS-Offline-Fallback', '1');
          return new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers
          });
        }

        return new Response(JSON.stringify({ error: 'Workbook unavailable offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkRes = await fetch(req);
        if (networkRes.ok) cache.put(req, networkRes.clone());
        return networkRes;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await cache.match('/index.html');
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
