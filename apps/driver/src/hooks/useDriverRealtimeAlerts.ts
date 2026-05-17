import { useEffect, useRef, useState } from 'react'
import { fireNativeAlert, requestNativeNotificationPermission, type NativeAlertPayload } from '@rms/platform'
import { supabase } from '../lib/supabase'
import { isNativeDriverApp } from '../lib/nativeDriverShell'

export type DriverAlert = NativeAlertPayload & { createdAt: number }

const ALERT_EVENT_TYPES = new Set([
  'order.assigned',
  'order.ready_for_dispatch',
  'order.updated',
  'order.cancelled',
])

export function useDriverRealtimeAlerts(driverId: string | undefined) {
  const [alerts, setAlerts] = useState<DriverAlert[]>([])
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isNativeDriverApp()) return
    void requestNativeNotificationPermission()
  }, [])

  useEffect(() => {
    if (!driverId) return

    let cancelled = false
    seenIds.current = new Set()

    supabase
      .from('driver_notifications')
      .select('id')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (cancelled) return
        for (const row of (data ?? []) as Array<{ id?: string }>) {
          if (row.id) seenIds.current.add(row.id)
        }
      })

    const channel = supabase
      .channel(`driver:alerts:${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_notifications',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string
            event_type?: string
            title?: string
            message?: string
          }
          if (!row?.id || seenIds.current.has(row.id)) return
          seenIds.current.add(row.id)

          const shouldAlert = row.event_type != null && ALERT_EVENT_TYPES.has(row.event_type)
          if (!shouldAlert) return

          const alert: DriverAlert = {
            id: row.id,
            title: row.title ?? 'Delivery update',
            message: row.message ?? '',
            tone:
              row.event_type === 'order.cancelled'
                ? 'error'
                : row.event_type === 'order.ready_for_dispatch'
                  ? 'warning'
                  : 'info',
            tag: `driver-${row.id}`,
            createdAt: Date.now(),
          }

          fireNativeAlert(alert)
          setAlerts((current) => [...current, alert].slice(-4))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void channel.unsubscribe()
    }
  }, [driverId])

  function dismissAlert(id: string) {
    setAlerts((current) => current.filter((a) => a.id !== id))
  }

  return { alerts, dismissAlert }
}
