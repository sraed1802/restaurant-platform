import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type StripeMode = 'test' | 'live'

export interface PaymentGatewaySettings {
  stripe_enabled: boolean
  stripe_mode: StripeMode
  checkout_label: string
}

const SETTINGS_KEY = 'payment_gateway_settings'
const DEFAULT_CHECKOUT_LABEL = 'Pay online with Stripe'

export const DEFAULT_PAYMENT_GATEWAY_SETTINGS: PaymentGatewaySettings = {
  stripe_enabled: false,
  stripe_mode: 'test',
  checkout_label: DEFAULT_CHECKOUT_LABEL,
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function coerceStripeMode(value: unknown): StripeMode {
  return value === 'live' ? 'live' : 'test'
}

function coerceCheckoutLabel(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CHECKOUT_LABEL
  const normalized = value.trim()
  return normalized.length > 0 ? normalized.slice(0, 80) : DEFAULT_CHECKOUT_LABEL
}

export function coercePaymentGatewaySettings(value: unknown): PaymentGatewaySettings {
  const raw = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

  return {
    stripe_enabled: coerceBoolean(raw.stripe_enabled, DEFAULT_PAYMENT_GATEWAY_SETTINGS.stripe_enabled),
    stripe_mode: coerceStripeMode(raw.stripe_mode),
    checkout_label: coerceCheckoutLabel(raw.checkout_label),
  }
}

export async function loadPaymentGatewaySettings(
  supabase: SupabaseClient
): Promise<PaymentGatewaySettings> {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) throw error
  if (!data?.value) return DEFAULT_PAYMENT_GATEWAY_SETTINGS

  return coercePaymentGatewaySettings(data.value)
}

export async function savePaymentGatewaySettings(
  supabase: SupabaseClient,
  settings: PaymentGatewaySettings,
  updatedBy: string
): Promise<void> {
  const normalizedSettings = coercePaymentGatewaySettings(settings)

  const { error } = await supabase
    .from('system_config')
    .upsert({
      key: SETTINGS_KEY,
      value: normalizedSettings,
      description: 'Stripe checkout runtime settings for guest ordering',
      updated_by: updatedBy,
    })

  if (error) throw error
}
