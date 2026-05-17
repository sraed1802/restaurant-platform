export type NativeAlertTone = 'info' | 'success' | 'warning' | 'error'

export type NativeAlertPayload = {
  id: string
  title: string
  message: string
  tone?: NativeAlertTone
  tag?: string
}

export function playAlertChime(): void {
  if (typeof window === 'undefined') return
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.1
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.16)
    osc.onended = () => {
      void ctx.close()
    }
  } catch {
    /* ignore */
  }
}

export function vibrateAlert(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([90, 50, 90])
    }
  } catch {
    /* ignore */
  }
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNativeNotification(alert: NativeAlertPayload): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(alert.title, {
      body: alert.message,
      tag: alert.tag ?? alert.id,
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch (err) {
    console.warn('Native notification failed', err)
  }
}

export function fireNativeAlert(alert: NativeAlertPayload): void {
  playAlertChime()
  vibrateAlert()
  showNativeNotification(alert)
}
