import { supabase } from '../lib/supabase'

interface ConfigResponse {
  value?: unknown
}

function coerceBooleanConfig(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true'
  if (value && typeof value === 'object') {
    return (value as { enabled?: unknown }).enabled === true
  }
  return false
}

function coerceNumberConfig(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  if (value && typeof value === 'object') {
    const parsed = parseFloat(String((value as { fee?: unknown }).fee ?? fallback))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export async function getDeliveryFeeConfig(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('manage-staff', {
    body: { action: 'get_config', key: 'delivery_fee' },
  })

  if (error) throw error

  return coerceNumberConfig((data as ConfigResponse | null)?.value, 0)
}

export async function updateDeliveryFeeConfig(value: number): Promise<void> {
  const { error } = await supabase.functions.invoke('manage-staff', {
    body: { action: 'set_config', key: 'delivery_fee', value },
  })

  if (error) throw error
}

export async function getFreeDeliveryConfig(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('manage-staff', {
    body: { action: 'get_config', key: 'free_delivery_enabled' },
  })

  if (error) throw error

  return coerceBooleanConfig((data as ConfigResponse | null)?.value)
}

export async function updateFreeDeliveryConfig(value: boolean): Promise<void> {
  const { error } = await supabase.functions.invoke('manage-staff', {
    body: { action: 'toggle_free_delivery', value },
  })

  if (error) throw error
}
