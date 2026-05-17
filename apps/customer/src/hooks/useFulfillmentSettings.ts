import { useEffect, useState } from 'react'
import { useFeatureFlag, useTenantScope } from '@rms/platform'
import type { FulfillmentMode } from '@rms/supabase/types'
import {
  DEFAULT_PUBLIC_FULFILLMENT_SETTINGS,
  getPublicFulfillmentSettings,
} from '../services/fulfillmentSettings'

export function useFulfillmentSettings() {
  const tenantScope = useTenantScope()
  const hotelRoomDeliveryEnabled = useFeatureFlag('hotelRoomDelivery')
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>('outside_delivery')
  const [loading, setLoading] = useState(hotelRoomDeliveryEnabled)

  useEffect(() => {
    let cancelled = false

    if (!hotelRoomDeliveryEnabled) {
      setFulfillmentMode('outside_delivery')
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    getPublicFulfillmentSettings(tenantScope)
      .then((settings) => {
        if (!cancelled) {
          setFulfillmentMode(settings.fulfillment_mode)
        }
      })
      .catch((error) => {
        console.error('Failed to load fulfillment settings:', error)
        if (!cancelled) {
          setFulfillmentMode(DEFAULT_PUBLIC_FULFILLMENT_SETTINGS.fulfillment_mode)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hotelRoomDeliveryEnabled, tenantScope.scopeKey])

  return {
    fulfillmentMode,
    loading,
    hotelRoomDeliveryEnabled,
  }
}
