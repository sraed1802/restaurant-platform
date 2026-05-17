import { supabase } from '../lib/supabase'

export type DriverStatus = 'offline' | 'available' | 'busy' | 'break'
export type DriverAction =
  | 'accept_assignment'
  | 'mark_delivered'
  | 'mark_cash_collected'
  | 'set_driver_status'

export interface DriverProfile {
  id: string
  auth_user_id: string | null
  name: string
  phone_e164: string
  status: DriverStatus
  active_order_id: string | null
  is_active: boolean
  login_email: string | null
}

export interface DriverNotification {
  id: string
  order_id: string
  event_type: 'order.assigned' | 'order.cancelled' | 'order.updated' | 'order.cash_collected'
  title: string
  message: string
  payload: Record<string, unknown>
  acknowledged_at: string | null
  created_at: string
}

export interface DriverOrderItem {
  id: string
  quantity: number
  total_price: number
  product_snapshot: {
    name_en?: string
    name_ar?: string
  }
}

export interface DriverOrderSummary {
  id: string
  status: 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'
  payment_method: 'cash' | 'card' | 'online'
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  total: number
  created_at: string
  confirmed_at?: string | null
  ready_at?: string | null
  dispatched_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  special_instructions?: string | null
  delivery_address: Record<string, string | undefined>
  customer: {
    name?: string | null
    phone_e164?: string | null
    email?: string | null
  } | null
  order_items?: DriverOrderItem[]
}

export interface DriverInboxResponse {
  driver: DriverProfile
  active_orders: DriverOrderSummary[]
  recent_orders: DriverOrderSummary[]
  notifications: DriverNotification[]
}

async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Your driver session has expired. Please sign in again.')
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  }
}

export async function getDriverInbox(): Promise<DriverInboxResponse> {
  const headers = await getAuthHeaders()
  const { data, error } = await supabase.functions.invoke('driver-order-inbox', {
    body: {},
    headers,
  })

  if (error) throw error

  const payload = (data ?? {}) as {
    success?: boolean
    data?: DriverInboxResponse
    error?: string
  }

  if (payload.success === false || payload.error || !payload.data) {
    throw new Error(payload.error || 'Failed to load driver inbox')
  }

  return payload.data
}

export async function runDriverAction(input: {
  action: DriverAction
  order_id?: string
  status?: DriverStatus
}): Promise<void> {
  const headers = await getAuthHeaders()
  const { data, error } = await supabase.functions.invoke('driver-order-action', {
    body: input,
    headers,
  })

  if (error) throw error

  const payload = (data ?? {}) as { success?: boolean; error?: string }
  if (payload.success === false || payload.error) {
    throw new Error(payload.error || 'Driver action failed')
  }
}
