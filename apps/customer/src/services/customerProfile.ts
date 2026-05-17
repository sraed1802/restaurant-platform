import { supabase } from '../lib/supabase'
import { isHotelRoomDeliveryAddress, isOutsideDeliveryAddress } from '@rms/supabase/fulfillment'
import type { DeliveryAddress } from '@rms/supabase/types'

export type CustomerProfileRow = {
  id: string
  name: string | null
  email: string | null
  phone_e164: string | null
  delivery_addresses: DeliveryAddress[] | null
  language_pref: string
}

function parseAddresses(raw: unknown): DeliveryAddress[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((a) => isOutsideDeliveryAddress(a) || isHotelRoomDeliveryAddress(a)) as DeliveryAddress[]
}

export async function fetchCustomerProfileRow(customerId: string): Promise<CustomerProfileRow | null> {
  const response = (await supabase
    .from('customers')
    .select('id, name, email, phone_e164, delivery_addresses, language_pref')
    .eq('id', customerId)
    .maybeSingle()) as {
    data: {
      id: string
      name: string | null
      email: string | null
      phone_e164: string | null
      delivery_addresses: unknown
      language_pref: string
    } | null
    error: { message: string } | null
  }

  if (response.error || !response.data) return null
  const data = response.data

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone_e164: data.phone_e164,
    delivery_addresses: parseAddresses(data.delivery_addresses),
    language_pref: data.language_pref ?? 'en',
  }
}

export async function updateCustomerProfile(input: {
  customerId: string
  name: string | null
  phone_e164: string | null
  delivery_addresses: DeliveryAddress[]
  language_pref?: 'en' | 'ar'
}): Promise<{ error: Error | null }> {
  const response = (await supabase
    .from('customers')
    .update({
      name: input.name ?? undefined,
      phone_e164: input.phone_e164 ?? undefined,
      delivery_addresses: input.delivery_addresses as unknown,
    } as never)
    .eq('id', input.customerId)) as { error: { message: string } | null }

  if (response.error) return { error: new Error(response.error.message) }
  return { error: null }
}
