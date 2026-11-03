// Only serves an explicitly saved Lite shell and its share-scoped images after network failure.
const SHELL = 'conceptlab-lite-shell-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate' && (url.pathname === '/lite' || url.pathname.startsWith('/lite/'))) {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(SHELL)).match('/')) || Response.error()))
    return
  }
  const image = url.pathname.match(/^\/api\/share\/([A-Za-z0-9]+)\/(?:sources|assets)\//)
  if (image) {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(`conceptlab-lite-images-${image[1].toUpperCase()}`)).match(request)) || Response.error()))
    return
  }
  if (!url.pathname.startsWith('/api/') && /\.(?:js|css|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(SHELL)).match(request)) || Response.error()))
  }
})
