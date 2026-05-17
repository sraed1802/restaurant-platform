import type { TenantScope } from '@rms/platform'
import type { DeliveryAddress, FulfillmentMode } from '@rms/supabase/types'
import { supabase } from '../lib/supabase'

export interface PlaceOrderPayload {
  phone_e164: string
  customer_name?: string | null
  fulfillment_mode?: FulfillmentMode
  delivery_address: DeliveryAddress
  items: Array<{
    product_id: string
    quantity: number
    selected_modifier_option_ids: string[]
    notes?: string
  }>
  promo_code?: string
  payment_method: 'cash' | 'card' | 'online'
  special_instructions?: string
  language_pref: 'en' | 'ar'
  tenant_scope?: {
    organization_id: TenantScope['organizationId']
    cluster_id: TenantScope['clusterId']
    property_id: TenantScope['propertyId']
  }
}

export interface PlaceOrderResult {
  success: boolean
  order_id?: string
  payment_url?: string | null
  error?: string
  reason?: string
  next_open_at?: string | null
  public_message?: string | null
}

async function parsePlaceOrderError(error: unknown): Promise<PlaceOrderResult | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) {
    return null
  }

  const response = (error as { context?: unknown }).context
  if (!(response instanceof Response)) {
    return null
  }

  try {
    const payload = (await response.clone().json()) as Partial<PlaceOrderResult>
    if (!payload || typeof payload !== 'object') {
      return null
    }

    return {
      success: false,
      error: typeof payload.error === 'string' ? payload.error : 'Order failed',
      reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      next_open_at: typeof payload.next_open_at === 'string' ? payload.next_open_at : null,
      public_message: typeof payload.public_message === 'string' ? payload.public_message : null,
    }
  } catch {
    return null
  }
}

export async function placeOrderRequest(payload: PlaceOrderPayload): Promise<PlaceOrderResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const authHeaders =
    session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined

  const { data, error } = await supabase.functions.invoke('place-order', {
    body: payload,
    ...(authHeaders ? { headers: authHeaders } : {}),
  })

  if (error) {
    const parsedError = await parsePlaceOrderError(error)
    if (parsedError) return parsedError
    throw error
  }

  return data as PlaceOrderResult
}
