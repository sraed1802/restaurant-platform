// RMS Restaurant PWA Service Worker
const STATIC_CACHE = 'rms-static-v2'
const DYNAMIC_CACHE = 'rms-dynamic-v2'

const STATIC_ASSETS = ['/', '/manifest.json', '/icon-192x192.png', '/icon-72x72.png']

const BYPASS_PREFIXES = ['/api/', '/auth/', '/login', '/@', '/src/']

function isLocalDev(url) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}

function shouldBypassCache(pathname) {
  return BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  )
}

function offlineHtmlResponse() {
  return new Response(
    `<!DOCTYPE html>
<html>
  <head>
    <title>Offline - Maazym</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; background: #faf8f4; }
      .offline-container { max-width: 400px; margin: 0 auto; }
      h1 { color: #0e0e0e; margin-bottom: 1rem; }
      p { color: #666; margin-bottom: 2rem; }
      .retry-btn { background: #b8975a; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="offline-container">
      <h1>You're offline</h1>
      <p>Please check your internet connection and try again.</p>
      <button class="retry-btn" onclick="window.location.reload()">Retry</button>
    </div>
  </body>
</html>`,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((error) => console.error('SW: install failed:', error)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              return caches.delete(cacheName)
            }
          }),
        ),
      )
      .then(() => self.clients.claim())
      .catch((error) => console.error('SW: activate failed:', error)),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const reqUrl = new URL(request.url)
  if (isLocalDev(reqUrl)) {
    event.respondWith(fetch(request))
    return
  }
  if (!request.url.startsWith(self.location.origin)) return
  if (shouldBypassCache(reqUrl.pathname) || reqUrl.pathname.includes('/node_modules/')) {
    event.respondWith(fetch(request))
    return
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  event.respondWith(staleWhileRevalidateAsset(request))
})

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch (error) {
    console.warn('SW: navigation fetch failed:', error)
    const cached = await caches.match(request)
    if (cached) return cached
    const shell = await caches.match('/')
    if (shell) return shell
    return offlineHtmlResponse()
  }
}

async function staleWhileRevalidateAsset(request) {
  const cached = await caches.match(request)
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (!response.ok) return response
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) return response
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone()).catch(() => {})
      return response
    })
    .catch((error) => {
      console.warn('SW: asset fetch failed:', error)
      return cached ?? offlineHtmlResponse()
    })

  return cached ?? networkPromise
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'CACHE_UPDATE') {
    event.waitUntil(caches.delete(DYNAMIC_CACHE))
  }
})
