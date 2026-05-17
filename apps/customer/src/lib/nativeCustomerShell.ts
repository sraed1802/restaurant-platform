import { Capacitor } from '@capacitor/core'

const NATIVE_CLASS = 'rms-native-customer'
const ANDROID_CLASS = 'rms-android-customer'

export function isNativeCustomerApp(): boolean {
  if (Capacitor.isNativePlatform()) {
    return true
  }
  if (typeof window === 'undefined') {
    return false
  }
  const w = window as Window & { androidBridge?: unknown }
  if (w.androidBridge) {
    return true
  }
  const webkitBridge = (
    window as Window & { webkit?: { messageHandlers?: { bridge?: unknown } } }
  ).webkit?.messageHandlers?.bridge
  return webkitBridge != null
}

export function isAndroidCustomerApp(): boolean {
  return Capacitor.getPlatform() === 'android'
}

/**
 * Call once at startup (before paint) so CSS and persist keys can target the Capacitor shell.
 * Web (mobile or desktop) is unchanged.
 */
export function initNativeCustomerShellClass(): void {
  if (typeof document === 'undefined') return
  if (isNativeCustomerApp()) {
    document.documentElement.classList.add(NATIVE_CLASS)
  }
  if (
    Capacitor.getPlatform() === 'android' ||
    (typeof window !== 'undefined' && !!(window as Window & { androidBridge?: unknown }).androidBridge)
  ) {
    document.documentElement.classList.add(ANDROID_CLASS)
  }
}
