import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { isNativeCustomerApp } from './nativeCustomerShell'

/**
 * Trigger haptic feedback if running in a native Capacitor environment.
 */
export async function triggerHapticImpact(style: ImpactStyle = ImpactStyle.Light) {
  if (isNativeCustomerApp()) {
    try {
      await Haptics.impact({ style })
    } catch (e) {
      // Silently fail if plugin not available
    }
  }
}

export async function triggerHapticSelection() {
  if (isNativeCustomerApp()) {
    try {
      await Haptics.selectionStart()
    } catch (e) {
      // Silently fail
    }
  }
}
