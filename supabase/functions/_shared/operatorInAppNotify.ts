import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type OperatorInAppEventType =
  | 'order.created'
  | 'order.cancelled'
  | 'order.status_updated'
  | 'driver.assignment_accepted'
  | 'driver.cash_collected'
  | 'driver.delivered'
  | 'driver.status_changed'

export async function emitOperatorInAppNotification(
  supabase: SupabaseClient,
  input: {
    event_type: OperatorInAppEventType
    title: string
    message: string
    order_id?: string | null
    driver_id?: string | null
    payload?: Record<string, unknown>
    audience_roles?: Array<'admin' | 'manager' | 'supervisor'>
    organization_id?: string | null
    cluster_id?: string | null
    property_id?: string | null
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('operator_notifications')
    .insert({
      event_type: input.event_type,
      title: input.title,
      message: input.message,
      order_id: input.order_id ?? null,
      driver_id: input.driver_id ?? null,
      payload: input.payload ?? {},
      audience_roles: input.audience_roles ?? ['admin', 'manager', 'supervisor'],
      organization_id: input.organization_id ?? null,
      cluster_id: input.cluster_id ?? null,
      property_id: input.property_id ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('emitOperatorInAppNotification failed', error)
    return null
  }

  return (data?.id as string) ?? null
}

export function driverStatusLabel(status: string): string {
  switch (status) {
    case 'available':
      return 'Available'
    case 'busy':
      return 'On delivery'
    case 'break':
      return 'On break'
    case 'offline':
      return 'Unavailable'
    default:
      return status
  }
}
