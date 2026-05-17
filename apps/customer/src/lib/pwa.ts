// apps/customer/src/lib/pwa.ts
const DYNAMIC_CACHE = 'rms-dynamic-v1'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private isInstallable = false

  constructor() {
    this.init()
  }

  private init() {
    // Defer the browser mini-infobar so we can call prompt() from our own UI (e.g. “Install app”).
    // Chrome DevTools may log “Banner not shown… preventDefault” — that is expected for this pattern.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferredPrompt = e as BeforeInstallPromptEvent
      this.isInstallable = true
      if (import.meta.env.DEV) {
        console.debug('PWA: deferred install prompt captured (use your in-app install control)')
      }
    })

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('PWA: App was installed')
      this.isInstallable = false
      this.deferredPrompt = null
    })

    // Service worker + Cache API break Vite dev (stale chunks → duplicate React / invalid hooks).
    // Only enable PWA after production build.
    if ('serviceWorker' in navigator) {
      if (import.meta.env.DEV) {
        void this.unregisterDevServiceWorkers()
      } else {
        this.registerServiceWorker()
      }
    }

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('PWA: App is online')
      this.showConnectionStatus(true)
    })

    window.addEventListener('offline', () => {
      console.log('PWA: App is offline')
      this.showConnectionStatus(false)
    })
  }

  /** Remove SW + caches in dev so old cached JS cannot mix with Vite’s module graph. */
  private async unregisterDevServiceWorkers() {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      console.log('PWA: Dev mode — service workers unregistered and caches cleared')
    } catch (e) {
      console.warn('PWA: Dev unregister failed', e)
    }
  }

  private async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      console.log('PWA: Service worker registered', registration)

      // Check for service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('PWA: New content available')
              this.showUpdateAvailable()
            }
          })
        }
      })
    } catch (error) {
      console.error('PWA: Service worker registration failed:', error)
    }
  }

  // Check if app can be installed
  canInstall(): boolean {
    return this.isInstallable && !!this.deferredPrompt
  }

  // Show install prompt
  async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt) return false

    try {
      await this.deferredPrompt.prompt()
      const { outcome } = await this.deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        console.log('PWA: User accepted install prompt')
        this.deferredPrompt = null
        this.isInstallable = false
        return true
      } else {
        console.log('PWA: User dismissed install prompt')
        return false
      }
    } catch (error) {
      console.error('PWA: Install prompt failed:', error)
      return false
    }
  }

  // Check if app is running in standalone mode
  isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://')
    )
  }

  // Show connection status notification
  private showConnectionStatus(isOnline: boolean) {
    // Create a simple notification for connection status
    const notification = document.createElement('div')
    notification.className = `connection-status ${isOnline ? 'online' : 'offline'}`
    notification.textContent = isOnline ? '🟢 Back online' : '🔴 You\'re offline'
    notification.style.cssText = `
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      background: ${isOnline ? '#10b981' : '#ef4444'};
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideDown 0.3s ease;
    `

    document.body.appendChild(notification)

    // Remove notification after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideUp 0.3s ease'
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification)
          }
        }, 300)
      }
    }, 3000)
  }

  // Show update available notification
  private showUpdateAvailable() {
    const notification = document.createElement('div')
    notification.className = 'update-available'
    notification.innerHTML = `
      <div style="
        position: fixed;
        bottom: 1rem;
        left: 1rem;
        right: 1rem;
        background: var(--gold);
        color: var(--cream);
        padding: 1rem;
        border-radius: 0.5rem;
        font-size: 0.9rem;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
      ">
        <span>🔄 New version available</span>
        <button onclick="location.reload()" style="
          background: white;
          color: var(--gold);
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 0.25rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
        ">Update</button>
      </div>
    `

    document.body.appendChild(notification)
  }

  // Request notification permission
  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('PWA: Notifications not supported')
      return false
    }

    if (Notification.permission === 'granted') {
      return true
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    }

    return false
  }

  // Subscribe to push notifications
  async subscribeToPushNotifications(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return null
    }

    try {
      const registration = await navigator.serviceWorker.ready
      
      // This would require a VAPID key from your server
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY'
      })

      console.log('PWA: Push subscription created', subscription)
      return subscription
    } catch (error) {
      console.error('PWA: Push subscription failed:', error)
      return null
    }
  }

  // Cache data for offline use
  async cacheData(url: string, data: any): Promise<void> {
    try {
      const cache = await caches.open(DYNAMIC_CACHE)
      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      })
      await cache.put(url, response)
    } catch (error) {
      console.error('PWA: Failed to cache data:', error)
    }
  }

  // Get cached data
  async getCachedData(url: string): Promise<any> {
    try {
      const cache = await caches.open(DYNAMIC_CACHE)
      const response = await cache.match(url)
      if (response) {
        return await response.json()
      }
      return null
    } catch (error) {
      console.error('PWA: Failed to get cached data:', error)
      return null
    }
  }
}

// Create global PWA instance
export const pwaManager = new PWAManager()

// Add CSS animations
const style = document.createElement('style')
style.textContent = `
  @keyframes slideDown {
    from { transform: translate(-50%, -100%); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }
  
  @keyframes slideUp {
    from { transform: translate(-50%, 0); opacity: 1; }
    to { transform: translate(-50%, -100%); opacity: 0; }
  }
`
document.head.appendChild(style)
