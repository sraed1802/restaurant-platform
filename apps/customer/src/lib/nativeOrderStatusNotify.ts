import { isNativeCustomerApp } from './nativeCustomerShell'
import type { Language } from '../../types'

/** Short copy for system notification + in-app context */
export function getOrderStatusNotifyCopy(
  status: string,
  isHotelRoomDelivery: boolean,
): { titleEn: string; titleAr: string; bodyEn: string; bodyAr: string } {
  switch (status) {
    case 'pending':
      return {
        titleEn: 'Order received',
        titleAr: 'تم استلام الطلب',
        bodyEn: 'We have your order and will confirm it shortly.',
        bodyAr: 'استلمنا طلبك وسيتم تأكيده قريباً.',
      }
    case 'confirmed':
      return {
        titleEn: 'Order confirmed',
        titleAr: 'تم تأكيد الطلب',
        bodyEn: 'Your order is confirmed and will be prepared.',
        bodyAr: 'تم تأكيد طلبك وسيتم تحضيره.',
      }
    case 'preparing':
      return {
        titleEn: 'Being prepared',
        titleAr: 'جارٍ التحضير',
        bodyEn: isHotelRoomDelivery ? 'Your order is being prepared for room delivery.' : 'Your order is being prepared in the kitchen.',
        bodyAr: isHotelRoomDelivery ? 'جارٍ تحضير طلبك لتوصيله إلى الغرفة.' : 'جارٍ تحضير طلبك في المطبخ.',
      }
    case 'ready':
      return {
        titleEn: isHotelRoomDelivery ? 'Ready for room drop-off' : 'Ready for pickup',
        titleAr: isHotelRoomDelivery ? 'جاهز للتوصيل للغرفة' : 'جاهز للاستلام',
        bodyEn: isHotelRoomDelivery ? 'Your order is ready to be brought to your room.' : 'Your order is ready for pickup.',
        bodyAr: isHotelRoomDelivery ? 'طلبك جاهز لتوصيله إلى غرفتك.' : 'طلبك جاهز للاستلام.',
      }
    case 'dispatched':
      return {
        titleEn: 'On the way',
        titleAr: 'في الطريق إليك',
        bodyEn: 'Your order is on the way to you.',
        bodyAr: 'طلبك في الطريق إليك.',
      }
    case 'delivered':
      return {
        titleEn: isHotelRoomDelivery ? 'Delivered to room' : 'Delivered',
        titleAr: isHotelRoomDelivery ? 'تم التوصيل إلى الغرفة' : 'تم التوصيل',
        bodyEn: isHotelRoomDelivery ? 'Your order was delivered to your room.' : 'Your order has been delivered.',
        bodyAr: isHotelRoomDelivery ? 'تم توصيل طلبك إلى غرفتك.' : 'تم توصيل طلبك.',
      }
    case 'cancelled':
      return {
        titleEn: 'Order cancelled',
        titleAr: 'تم إلغاء الطلب',
        bodyEn: 'Your order was cancelled. Contact us if you need help.',
        bodyAr: 'تم إلغاء طلبك. تواصل معنا إذا احتجت مساعدة.',
      }
    default:
      return {
        titleEn: 'Order update',
        titleAr: 'تحديث الطلب',
        bodyEn: `Your order status is now: ${status}.`,
        bodyAr: `حالة طلبك الآن: ${status}.`,
      }
  }
}

function playInAppBeep(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.09
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.14)
    osc.onended = () => {
      void ctx.close()
    }
  } catch {
    /* ignore */
  }
}

function vibrateShort(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([80, 40, 80])
    }
  } catch {
    /* ignore */
  }
}

/**
 * Request notification permission once (Android 13+ needs POST_NOTIFICATIONS in manifest).
 */
export async function requestOrderTrackingNotifyPermission(): Promise<boolean> {
  if (!isNativeCustomerApp() || typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Show a mobile notification and play a short sound when order status changes (native shell).
 */
export function notifyNativeOrderStatusChange(options: {
  language: Language
  status: string
  isHotelRoomDelivery: boolean
  orderShortId: string
}): void {
  if (!isNativeCustomerApp() || typeof window === 'undefined') return

  const copy = getOrderStatusNotifyCopy(options.status, options.isHotelRoomDelivery)
  const title = options.language === 'ar' ? copy.titleAr : copy.titleEn
  const body = options.language === 'ar' ? copy.bodyAr : copy.bodyEn

  playInAppBeep()
  vibrateShort()

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  try {
    const n = new Notification(title, {
      body: `${body} (#${options.orderShortId})`,
      tag: `rms-order-${options.orderShortId}-${options.status}`,
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch (err) {
    console.warn('Order status notification failed:', err)
  }
}
