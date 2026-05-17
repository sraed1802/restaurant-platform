import { supabase } from '../lib/supabase'

export type StripeMode = 'test' | 'live'

export interface PaymentGatewaySettings {
  stripe_enabled: boolean
  stripe_mode: StripeMode
  checkout_label: string
}

export interface PaymentGatewaySettingsResponse {
  settings: PaymentGatewaySettings
  can_edit: boolean
  can_view: boolean
}

export const DEFAULT_PAYMENT_GATEWAY_SETTINGS: PaymentGatewaySettings = {
  stripe_enabled: false,
  stripe_mode: 'test',
  checkout_label: 'Pay online with Stripe',
}

export async function getPaymentGatewaySettings(): Promise<PaymentGatewaySettingsResponse> {
  const { data, error } = await supabase.functions.invoke('manage-payment-gateway-settings', {
    body: { action: 'get_settings' },
  })

  if (error) throw error

  return {
    settings: data?.settings ?? DEFAULT_PAYMENT_GATEWAY_SETTINGS,
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}

export async function updatePaymentGatewaySettings(input: {
  settings: PaymentGatewaySettings
}): Promise<PaymentGatewaySettingsResponse> {
  const { data, error } = await supabase.functions.invoke('manage-payment-gateway-settings', {
    body: {
      action: 'update_settings',
      settings: input.settings,
    },
  })

  if (error) throw error

  return {
    settings: data?.settings ?? DEFAULT_PAYMENT_GATEWAY_SETTINGS,
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}
