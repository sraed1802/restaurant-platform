import { Capacitor } from '@capacitor/core'
import { openAndroidPackageId } from '../plugins/launchExternalApp'

const ANDROID_ADMIN_PACKAGE =
  (import.meta.env.VITE_ANDROID_ADMIN_PACKAGE as string | undefined) ?? 'com.hostera.admin'
const ANDROID_DRIVER_PACKAGE =
  (import.meta.env.VITE_ANDROID_DRIVER_PACKAGE as string | undefined) ?? 'com.hostera.driver'

/**
 * WebView often blocks `intent://` navigation from JS click handlers; use the native plugin first.
 * Android 11+ package visibility: `<queries>` in AndroidManifest.xml.
 */
function launchAndroidLauncherIntentFallback(packageId: string): void {
  const intent =
    `intent:#Intent;action=android.intent.action.MAIN;` +
    `category=android.intent.category.LAUNCHER;` +
    `package=${packageId};end`
  window.location.assign(intent)
}

async function launchAndroidPackageBestEffort(packageId: string): Promise<void> {
  try {
    await openAndroidPackageId(packageId)
  } catch {
    launchAndroidLauncherIntentFallback(packageId)
  }
}

export async function openExternalAdminApp(): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    await launchAndroidPackageBestEffort(ANDROID_ADMIN_PACKAGE)
    return
  }
  const web = import.meta.env.VITE_ADMIN_WEB_URL as string | undefined
  if (web?.trim()) {
    window.open(web.trim(), '_blank', 'noopener,noreferrer')
    return
  }
  console.warn(
    '[openExternalAdminApp] Install the Admin Android app (package ' + ANDROID_ADMIN_PACKAGE + ') or set VITE_ADMIN_WEB_URL.',
  )
}

export async function openExternalDriverApp(): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    await launchAndroidPackageBestEffort(ANDROID_DRIVER_PACKAGE)
    return
  }
  const web = import.meta.env.VITE_DRIVER_WEB_URL as string | undefined
  if (web?.trim()) {
    window.open(web.trim(), '_blank', 'noopener,noreferrer')
    return
  }
  console.warn(
    '[openExternalDriverApp] Install the Driver Android app (package ' + ANDROID_DRIVER_PACKAGE + ') or set VITE_DRIVER_WEB_URL.',
  )
}

/**
 * Handles customer-app custom URL schemes (shortcuts / OS links). Returns true if consumed.
 */
export function dispatchCustomerAppUrlOpen(rawUrl: string): boolean {
  let target: 'admin' | 'driver' | null = null
  try {
    const url = new URL(rawUrl)
    const proto = url.protocol.replace(/:$/, '')
    if (proto === 'com.maazym.customer' || proto === 'com.hostera.customer') {
      const h = url.hostname
      if (h === 'admin') target = 'admin'
      else if (h === 'driver') target = 'driver'
    }
  } catch {
    if (rawUrl.includes('://admin')) target = 'admin'
    else if (rawUrl.includes('://driver')) target = 'driver'
  }
  if (target === 'admin') {
    void openExternalAdminApp()
    return true
  }
  if (target === 'driver') {
    void openExternalDriverApp()
    return true
  }
  return false
}
