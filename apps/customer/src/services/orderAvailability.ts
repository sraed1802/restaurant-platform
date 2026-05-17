import type { TenantScope } from '@rms/platform'
import { supabase } from '../lib/supabase'

export type OrderAvailabilityManualMode = 'scheduled' | 'force_open' | 'force_closed'
export type OrderAvailabilityOverrideMode = 'open' | 'closed'

export interface OrderAvailabilityOverride {
  id?: string
  starts_at: string
  ends_at: string
  mode: OrderAvailabilityOverrideMode
  label: string | null
  message_en: string | null
  message_ar: string | null
}

export interface OrderAvailabilityStatus {
  is_open_now: boolean
  reason:
    | 'force_open'
    | 'force_closed'
    | 'override_open'
    | 'override_closed'
    | 'weekly_schedule'
    | 'outside_schedule'
  manual_mode: OrderAvailabilityManualMode
  timezone: string
  next_open_at: string | null
  public_message_en: string | null
  public_message_ar: string | null
  active_override: OrderAvailabilityOverride | null
}

export interface PublicOrderAvailabilityResponse {
  status: OrderAvailabilityStatus
  settings: {
    timezone: string
    closure_message_en: string | null
    closure_message_ar: string | null
  }
}

export const DEFAULT_ORDER_AVAILABILITY_STATUS: OrderAvailabilityStatus = {
  is_open_now: true,
  reason: 'force_open',
  manual_mode: 'force_open',
  timezone: 'Asia/Qatar',
  next_open_at: null,
  public_message_en: null,
  public_message_ar: null,
  active_override: null,
}

function toScopePayload(scope: TenantScope) {
  return {
    organization_id: scope.organizationId,
    cluster_id: scope.clusterId,
    property_id: scope.propertyId,
  }
}

function normalizeStatus(value: unknown): OrderAvailabilityStatus {
  const raw = value && typeof value === 'object' ? (value as Partial<OrderAvailabilityStatus>) : {}

  return {
    is_open_now: raw.is_open_now !== false,
    reason:
      raw.reason === 'force_closed' ||
      raw.reason === 'override_open' ||
      raw.reason === 'override_closed' ||
      raw.reason === 'weekly_schedule' ||
      raw.reason === 'outside_schedule'
        ? raw.reason
        : 'force_open',
    manual_mode:
      raw.manual_mode === 'scheduled' || raw.manual_mode === 'force_closed' || raw.manual_mode === 'force_open'
        ? raw.manual_mode
        : 'force_open',
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone : 'Asia/Qatar',
    next_open_at: typeof raw.next_open_at === 'string' ? raw.next_open_at : null,
    public_message_en: typeof raw.public_message_en === 'string' ? raw.public_message_en : null,
    public_message_ar: typeof raw.public_message_ar === 'string' ? raw.public_message_ar : null,
    active_override:
      raw.active_override && typeof raw.active_override === 'object'
        ? {
            id: typeof raw.active_override.id === 'string' ? raw.active_override.id : undefined,
            starts_at:
              typeof raw.active_override.starts_at === 'string'
                ? raw.active_override.starts_at
                : new Date().toISOString(),
            ends_at:
              typeof raw.active_override.ends_at === 'string'
                ? raw.active_override.ends_at
                : new Date().toISOString(),
            mode: raw.active_override.mode === 'open' ? 'open' : 'closed',
            label: typeof raw.active_override.label === 'string' ? raw.active_override.label : null,
            message_en:
              typeof raw.active_override.message_en === 'string' ? raw.active_override.message_en : null,
            message_ar:
              typeof raw.active_override.message_ar === 'string' ? raw.active_override.message_ar : null,
          }
        : null,
  }
}

export async function getPublicOrderAvailability(scope: TenantScope): Promise<PublicOrderAvailabilityResponse> {
  const { data, error } = await supabase.functions.invoke('manage-order-availability', {
    body: {
      action: 'get_public_status',
      scope: toScopePayload(scope),
    },
  })

  if (error) throw error

  return {
    status: normalizeStatus(data?.status),
    settings: {
      timezone:
        typeof data?.settings?.timezone === 'string' && data.settings.timezone.trim()
          ? data.settings.timezone
          : 'Asia/Qatar',
      closure_message_en:
        typeof data?.settings?.closure_message_en === 'string' ? data.settings.closure_message_en : null,
      closure_message_ar:
        typeof data?.settings?.closure_message_ar === 'string' ? data.settings.closure_message_ar : null,
    },
  }
}
