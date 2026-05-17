import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type DriverNotificationEvent =
  | 'order.assigned'
  | 'order.cancelled'
  | 'order.updated'
  | 'order.ready_for_dispatch'
  | 'order.cash_collected'

export async function createDriverNotification(
  supabase: SupabaseClient,
  input: {
    driver_id: string
    order_id: string
    event_type: DriverNotificationEvent
    title: string
    message: string
    payload?: Record<string, unknown>
    organization_id?: string | null
    cluster_id?: string | null
    property_id?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from('driver_notifications').insert({
    driver_id: input.driver_id,
    order_id: input.order_id,
    event_type: input.event_type,
    title: input.title,
    message: input.message,
    payload: input.payload ?? {},
    organization_id: input.organization_id ?? null,
    cluster_id: input.cluster_id ?? null,
    property_id: input.property_id ?? null,
  })

  if (error) {
    throw error
  }
}

export async function acknowledgeDriverNotifications(
  supabase: SupabaseClient,
  driverId: string,
  orderId: string
): Promise<void> {
  const { error } = await supabase
    .from('driver_notifications')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('driver_id', driverId)
    .eq('order_id', orderId)
    .is('acknowledged_at', null)

  if (error) {
    throw error
  }
}

export async function releaseDriverAssignment(
  supabase: SupabaseClient,
  driverId: string,
  orderId: string,
  nextStatus: 'available' | 'offline' = 'available'
): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({
      active_order_id: null,
      status: nextStatus,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', driverId)
    .eq('active_order_id', orderId)

  if (error) {
    throw error
  }
}
