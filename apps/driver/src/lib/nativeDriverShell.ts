import { Capacitor } from '@capacitor/core'

export function isNativeDriverApp(): boolean {
  return Capacitor.isNativePlatform()
}
