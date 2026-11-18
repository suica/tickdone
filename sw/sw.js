// TickDone's service worker, written by hand. The build (serviceWorkerPlugin in vite.config.ts) puts the
// list of built files and a version in place of the two constants below and writes it to dist/sw.js.
//
// - The app shell and its assets are cached on install, so the app opens offline after the first visit.
// - Hashed files under /assets/ never change: cache first. The page itself (index.html): network first,
//   the cached copy when offline.
// - /api/ (the calendar feed proxy) is never touched here; the app keeps its own copies of feeds.
// - A new version waits until the app asks it to take over ("Reload" in the update toast).
// - A click on a reminder notification focuses the app and opens the task.

/* global self, caches, clients */
const VERSION = '__VERSION__'
const PRECACHE = []
const CACHE = 'tickdone-' + VERSION
const SHELL = '/index.html'
/** How long to wait for the network before showing the cached page. */
const NAVIGATE_TIMEOUT = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', ...PRECACHE.filter((p) => p !== '/')])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('tickdone-') && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting()
})

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = () => cache.match(SHELL, { ignoreVary: true }).then((r) => r || cache.match('/', { ignoreVary: true }))
  try {
    const network = fetch(request).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(SHELL, res.clone())
      return res
    })
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATE_TIMEOUT))
    // Slow networks: show the cached page after a while instead of a blank screen
    const first = await Promise.race([network, timeout.then(cached)])
    return first || (await network)
  } catch {
    const res = await cached()
    if (res) return res
    throw new Error('offline and not cached')
  }
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true })
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') cache.put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // The feed proxy and anything else under /api/ goes straight to the network, never into this cache
  if (url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fromNetworkFirst(request))
    return
  }
  if (url.pathname === '/sw.js') return
  event.respondWith(fromCacheFirst(request))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const taskId = event.notification.data && event.notification.data.taskId
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin)
      if (client) {
        await client.focus()
        if (taskId) client.postMessage({ type: 'open-task', taskId })
        return
      }
      await self.clients.openWindow(taskId ? '/#task=' + encodeURIComponent(taskId) : '/')
    })(),
  )
})
