import type { TenantScope } from '@rms/platform'
import type { FulfillmentMode } from '@rms/supabase/types'
import { supabase } from '../lib/supabase'

export interface PublicFulfillmentSettings {
  fulfillment_mode: FulfillmentMode
}

export const DEFAULT_PUBLIC_FULFILLMENT_SETTINGS: PublicFulfillmentSettings = {
  fulfillment_mode: 'outside_delivery',
}

function toScopePayload(scope: TenantScope) {
  return {
    organization_id: scope.organizationId,
    cluster_id: scope.clusterId,
    property_id: scope.propertyId,
  }
}

export async function getPublicFulfillmentSettings(scope: TenantScope): Promise<PublicFulfillmentSettings> {
  const { data, error } = await supabase.functions.invoke('manage-fulfillment-settings', {
    body: {
      action: 'get_public_settings',
      scope: toScopePayload(scope),
    },
  })

  if (error) throw error

  return {
    fulfillment_mode: data?.settings?.fulfillment_mode === 'hotel_room_delivery'
      ? 'hotel_room_delivery'
      : 'outside_delivery',
  }
}
