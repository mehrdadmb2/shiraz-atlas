/* Shiraz Atlas offline shell + visited map-tile cache. No bulk tile prefetch. */
const STATIC_CACHE = 'shiraz-atlas-static-v1.4.0';
const TILE_CACHE = 'shiraz-atlas-visited-map-tiles-v1';
const TILE_HOSTS = new Set(['tile.openstreetmap.org', 'tile.openmaps.fr']);
const CORE_ASSETS = [
  './', './index.html', './css/styles.css', './js/config.js', './js/utils.js',
  './js/api.js', './js/map.js', './js/app.js', './assets/atlas-mark.svg',
  './assets/atlas-banner.svg', './assets/cyber-topography.webp'
];
const MAX_TILE_ENTRIES = 700;
const DEFAULT_TILE_TTL = 7 * 24 * 60 * 60 * 1000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('shiraz-atlas-static-') && k !== STATIC_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function vendorRequest(url, request) {
  return request.method === 'GET' && url.hostname === 'cdn.jsdelivr.net' && /\/leaflet@1\.9\.4\/dist\/leaflet\.(?:js|css)$/.test(url.pathname);
}

function tileRequest(url, request) {
  return request.method === 'GET' && TILE_HOSTS.has(url.hostname) && /\/(\d+)\/(\d+)\/(\d+)\.png(?:\?|$)/.test(url.pathname + url.search);
}

async function tileCacheIsFresh(response) {
  const savedAt = Number(response.headers.get('x-atlas-cache-time') || 0);
  if (!savedAt) return false;
  const cacheControl = response.headers.get('x-atlas-origin-cache-control') || '';
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
  // Honour provider TTL. Where no max-age is exposed, retain the tile for 7 days.
  const ttl = match ? Number(match[1]) * 1000 : DEFAULT_TILE_TTL;
  return Date.now() - savedAt <= ttl;
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_TILE_ENTRIES + 50) return;
  const entries = [];
  for (const request of keys) {
    const response = await cache.match(request);
    entries.push({ request, time: Number(response?.headers.get('x-atlas-cache-time') || 0) });
  }
  entries.sort((a, b) => a.time - b.time);
  await Promise.all(entries.slice(0, entries.length - MAX_TILE_ENTRIES).map(x => cache.delete(x.request)));
}

async function getMapTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached && await tileCacheIsFresh(cached)) {
    // Serve the tile already viewed on this device; refresh it opportunistically.
    fetch(request).then(async response => {
      if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) return;
      const headers = new Headers(response.headers);
      headers.set('x-atlas-cache-time', String(Date.now()));
      headers.set('x-atlas-origin-cache-control', response.headers.get('cache-control') || '');
      await cache.put(request, new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers }));
      await trimTileCache(cache);
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok && /^image\//i.test(response.headers.get('content-type') || '')) {
      const headers = new Headers(response.headers);
      headers.set('x-atlas-cache-time', String(Date.now()));
      headers.set('x-atlas-origin-cache-control', response.headers.get('cache-control') || '');
      await cache.put(request, new Response(await response.clone().blob(), { status: response.status, statusText: response.statusText, headers }));
      await trimTileCache(cache);
    }
    return response;
  } catch (error) {
    if (cached && await tileCacheIsFresh(cached)) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (tileRequest(url, request)) {
    event.respondWith(getMapTile(request).catch(() => Response.error()));
    return;
  }
  if (vendorRequest(url, request)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); }).catch(() => {});
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })().catch(() => Response.error()));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  if (url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});
