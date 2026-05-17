import { useEffect, useRef, useState } from 'react'
import { isHotelFulfillmentOrder } from '@rms/supabase/fulfillment'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { isNativeCustomerApp } from '../lib/nativeCustomerShell'
import { notifyNativeOrderStatusChange } from '../lib/nativeOrderStatusNotify'

export type ActiveOrderProgress = {
  id: string
  status: string
  total: number
  created_at: string
  fulfillment_mode?: 'outside_delivery' | 'hotel_room_delivery'
  cancelled_at?: string | null
}

const IN_PROGRESS_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched'] as const
const CANCELLED_VISIBLE_MS = 30 * 60_000

export function useActiveOrderProgress() {
  const { customerId, language } = useSessionStore()
  const [order, setOrder] = useState<ActiveOrderProgress | null>(null)
  const [loading, setLoading] = useState(false)
  const prevStatusRef = useRef<string | null>(null)

  useEffect(() => {
    if (!customerId) {
      setOrder(null)
      prevStatusRef.current = null
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)

      const { data: inProgress, error: activeError } = await supabase
        .from('orders')
        .select('id, status, total, created_at, fulfillment_mode, cancelled_at')
        .eq('customer_id', customerId)
        .in('status', [...IN_PROGRESS_STATUSES])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (activeError) {
        console.warn('useActiveOrderProgress', activeError)
        setOrder(null)
        setLoading(false)
        return
      }

      if (inProgress) {
        setOrder(inProgress as ActiveOrderProgress)
        setLoading(false)
        return
      }

      const cutoff = new Date(Date.now() - CANCELLED_VISIBLE_MS).toISOString()
      const { data: recentCancelled, error: cancelledError } = await supabase
        .from('orders')
        .select('id, status, total, created_at, fulfillment_mode, cancelled_at, updated_at')
        .eq('customer_id', customerId)
        .eq('status', 'cancelled')
        .gte('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (cancelledError) {
        console.warn('useActiveOrderProgress cancelled', cancelledError)
        setOrder(null)
      } else {
        setOrder((recentCancelled as ActiveOrderProgress | null) ?? null)
      }
      setLoading(false)
    }

    void load()

    const channel = supabase
      .channel(`customer:active-order:${customerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${customerId}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void channel.unsubscribe()
    }
  }, [customerId])

  useEffect(() => {
    prevStatusRef.current = null
  }, [customerId])

  useEffect(() => {
    if (!order || !isNativeCustomerApp()) return

    const shortId = order.id.slice(0, 8).toUpperCase()
    const isHotel = isHotelFulfillmentOrder(order)

    if (prevStatusRef.current === null) {
      prevStatusRef.current = order.status
      return
    }

    if (prevStatusRef.current === order.status) return

    notifyNativeOrderStatusChange({
      language,
      status: order.status,
      isHotelRoomDelivery: isHotel,
      orderShortId: shortId,
    })
    prevStatusRef.current = order.status
  }, [order, language])

  const isCancelled = order?.status === 'cancelled'

  return { order, loading, isCancelled }
}
