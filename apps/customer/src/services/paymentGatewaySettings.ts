import { supabase } from '../lib/supabase'

export interface PublicPaymentGatewaySettings {
  stripe_enabled: boolean
  stripe_mode: 'test' | 'live'
  checkout_label: string
}

export const DEFAULT_PUBLIC_PAYMENT_GATEWAY_SETTINGS: PublicPaymentGatewaySettings = {
  stripe_enabled: false,
  stripe_mode: 'test',
  checkout_label: 'Pay online with Stripe',
}

export async function getPublicPaymentGatewaySettings(): Promise<PublicPaymentGatewaySettings> {
  const { data, error } = await supabase.functions.invoke('manage-payment-gateway-settings', {
    body: { action: 'get_public_settings' },
  })

  if (error) throw error

  return data?.settings ?? DEFAULT_PUBLIC_PAYMENT_GATEWAY_SETTINGS
}
