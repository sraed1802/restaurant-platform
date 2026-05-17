import type { TenantScope } from '@rms/platform'
import type { FulfillmentMode } from '@rms/supabase/types'
import { supabase } from '../lib/supabase'

export interface FulfillmentSettingsResponse {
  settings: {
    fulfillment_mode: FulfillmentMode
  }
  can_edit: boolean
  can_view: boolean
}

export const DEFAULT_FULFILLMENT_SETTINGS: FulfillmentSettingsResponse['settings'] = {
  fulfillment_mode: 'outside_delivery',
}

function toScopePayload(scope: TenantScope) {
  return {
    organization_id: scope.organizationId,
    cluster_id: scope.clusterId,
    property_id: scope.propertyId,
  }
}

function normalizeSettings(value: unknown): FulfillmentSettingsResponse['settings'] {
  const raw = value && typeof value === 'object' ? (value as { fulfillment_mode?: unknown }) : {}
  return {
    fulfillment_mode: raw.fulfillment_mode === 'hotel_room_delivery' ? 'hotel_room_delivery' : 'outside_delivery',
  }
}

export async function getFulfillmentSettings(scope: TenantScope): Promise<FulfillmentSettingsResponse> {
  const { data, error } = await supabase.functions.invoke('manage-fulfillment-settings', {
    body: {
      action: 'get_settings',
      scope: toScopePayload(scope),
    },
  })

  if (error) throw error

  return {
    settings: normalizeSettings(data?.settings),
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}

export async function updateFulfillmentSettings(input: {
  scope: TenantScope
  settings: FulfillmentSettingsResponse['settings']
}): Promise<FulfillmentSettingsResponse> {
  const { data, error } = await supabase.functions.invoke('manage-fulfillment-settings', {
    body: {
      action: 'update_settings',
      scope: toScopePayload(input.scope),
      settings: input.settings,
    },
  })

  if (error) throw error

  return {
    settings: normalizeSettings(data?.settings),
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}
