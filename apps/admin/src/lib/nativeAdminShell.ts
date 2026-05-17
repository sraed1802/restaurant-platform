import { Capacitor } from '@capacitor/core'

export function isNativeAdminApp(): boolean {
  return Capacitor.isNativePlatform()
}
