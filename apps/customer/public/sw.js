// RMS Restaurant PWA Service Worker
const CACHE_NAME = 'rms-restaurant-v1'
const STATIC_CACHE = 'rms-static-v1'
const DYNAMIC_CACHE = 'rms-dynamic-v1'

// Files to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/menu',
  '/cart',
  '/track',
  '/manifest.json',
  // Add your CSS and JS files here
  '/index.html',
  '/favicon.ico'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('SW: Installing service worker')
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('SW: Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log('SW: Static assets cached successfully')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('SW: Failed to cache static assets:', error)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('SW: Activating service worker')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('SW: Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        console.log('SW: Activation complete')
        return self.clients.claim()
      })
      .catch((error) => {
        console.error('SW: Activation failed:', error)
      })
  )
})

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event
  const reqUrl = new URL(request.url)

  // Local dev (Vite): never cache — stale responses cause mixed React chunks + broken HMR WebSockets symptoms
  if (reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1') {
    event.respondWith(fetch(request))
    return
  }

  // Vite / tooling paths if ever hit through SW
  if (
    reqUrl.pathname.startsWith('/@') ||
    reqUrl.pathname.startsWith('/src/') ||
    reqUrl.pathname.includes('/node_modules/')
  ) {
    event.respondWith(fetch(request))
    return
  }
  
  // Skip non-GET requests
  if (request.method !== 'GET') return
  
  // Skip external requests (API calls, etc.)
  if (!request.url.startsWith(self.location.origin)) return
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response
        }
        
        return fetchAndCache(event.request)
      })
      .catch(() => {
        // Return offline page for HTML requests
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return new Response(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Offline - RMS Restaurant</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; background: #faf8f4; }
                  .offline-container { max-width: 400px; margin: 0 auto; }
                  .icon { font-size: 4rem; margin-bottom: 1rem; }
                  h1 { color: #0e0e0e; margin-bottom: 1rem; }
                  p { color: #666; margin-bottom: 2rem; }
                  .retry-btn { background: #b8975a; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; cursor: pointer; }
                </style>
              </head>
              <body>
                <div class="offline-container">
                  <div class="icon">🍽️</div>
                  <h1>You're offline</h1>
                  <p>Please check your internet connection and try again.</p>
                  <button class="retry-btn" onclick="window.location.reload()">Retry</button>
                </div>
              </body>
            </html>
          `, {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html' }
          })
        }
      })
  )
})

// Helper function to fetch and cache responses
function fetchAndCache(request) {
  return fetch(request)
    .then((response) => {
      // Don't cache non-successful responses
      if (!response.ok) return response
      
      // Don't cache large files or API responses
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json') || response.headers.get('content-length') > 1024 * 1024) {
        return response
      }
      
      // Cache the response for future use
      const responseClone = response.clone()
      caches.open(DYNAMIC_CACHE)
        .then((cache) => {
          cache.put(request, responseClone)
        })
        .catch((error) => {
          console.error('SW: Failed to cache response:', error)
        })
      
      return response
    })
    .catch((error) => {
      console.error('SW: Network request failed:', error)
      throw error
    })
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-orders') {
    event.waitUntil(syncOfflineOrders())
  }
})

// Sync offline orders when back online
function syncOfflineOrders() {
  return self.registration.sync.register('background-sync-orders')
    .then(() => {
      console.log('SW: Background sync registered')
    })
    .catch((error) => {
      console.error('SW: Background sync failed:', error)
    })
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return
  
  const options = {
    body: event.data.text(),
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Explore',
        icon: '/icon-96x96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icon-96x96.png'
      }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification('RMS Restaurant', options)
  )
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})

// Message handling for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(
      caches.delete(DYNAMIC_CACHE)
        .then(() => {
          console.log('SW: Dynamic cache cleared')
        })
    )
  }
})
