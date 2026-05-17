import { useEffect, useState } from 'react'
import {
  fetchCustomerPromotionContext,
  type CustomerPromotionContext,
} from '../services/promotionEligibility'

const DEFAULT_CUSTOMER_PROMOTION_CONTEXT: CustomerPromotionContext = {
  hasPlacedOrder: false,
}

export function useCustomerPromotionContext(
  phone: string | null | undefined,
  customerId: string | null | undefined
) {
  const [context, setContext] = useState<CustomerPromotionContext>(
    DEFAULT_CUSTOMER_PROMOTION_CONTEXT
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadCustomerPromotionContext() {
      setLoading(true)
      setError(null)

      try {
        const nextContext = await fetchCustomerPromotionContext(phone)
        if (!cancelled) {
          setContext(nextContext)
        }
      } catch (contextError) {
        console.error('Failed to load promotion eligibility:', contextError)
        if (!cancelled) {
          setContext(DEFAULT_CUSTOMER_PROMOTION_CONTEXT)
          setError(
            contextError instanceof Error
              ? contextError.message
              : 'Failed to load promotion eligibility'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadCustomerPromotionContext()

    return () => {
      cancelled = true
    }
  }, [customerId, phone])

  return {
    context,
    loading,
    error,
  }
}
