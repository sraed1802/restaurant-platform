const CACHE_NAME = 'ops-center-admin-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/admin-pwa-icon-192.png',
  '/admin-pwa-icon-512.png',
  '/admin-pwa-maskable-512.png',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Keep Supabase/API traffic live and never cache authenticated backend responses.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const freshResponse = await fetch(request)
          const cache = await caches.open(CACHE_NAME)
          cache.put('/index.html', freshResponse.clone())
          return freshResponse
        } catch (error) {
          return (await caches.match(request)) || (await caches.match('/index.html'))
        }
      })()
    )
    return
  }

  if (['style', 'script', 'worker', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const cachedResponse = await cache.match(request)

        const networkResponsePromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone())
            }
            return response
          })
          .catch(() => undefined)

        return cachedResponse || networkResponsePromise || Response.error()
      })()
    )
  }
})
