import { supabase } from '../lib/supabase'

export interface CustomerPromotionContext {
  hasPlacedOrder: boolean
}

interface PromotionEligibilityResponse {
  hasPlacedOrder?: boolean
}

interface PromotionLike {
  condition_type?: string | null
}

interface PromotionDiscountLike extends PromotionLike {
  discount_type?: string | null
  discount_value?: number | null
  max_discount_cap?: number | null
}

export function normalizePhoneForPromotionLookup(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim() ?? ''
  if (!trimmed) return null

  const compact = trimmed.replace(/\s+/g, '')
  return compact.startsWith('+') ? compact : `+974${compact}`
}

export async function fetchCustomerPromotionContext(
  phone: string | null | undefined
): Promise<CustomerPromotionContext> {
  const normalizedPhone = normalizePhoneForPromotionLookup(phone)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const authHeaders =
    session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined

  const { data, error } = await supabase.functions.invoke('promotion-eligibility', {
    body: {
      phone_e164: normalizedPhone ?? undefined,
    },
    ...(authHeaders ? { headers: authHeaders } : {}),
  })

  if (error) {
    throw error
  }

  const response = (data ?? null) as PromotionEligibilityResponse | null

  return {
    hasPlacedOrder: response?.hasPlacedOrder === true,
  }
}

export function isPromotionEligibleForCustomer<T extends PromotionLike>(
  promotion: T,
  context: CustomerPromotionContext
): boolean {
  if (promotion.condition_type === 'first_order' && context.hasPlacedOrder) {
    return false
  }

  return true
}

export function filterPromotionsForCustomer<T extends PromotionLike>(
  promotions: T[],
  context: CustomerPromotionContext
): T[] {
  return promotions.filter((promotion) => isPromotionEligibleForCustomer(promotion, context))
}

export function getPromotionDiscountAmount<T extends PromotionDiscountLike>(
  promotion: T | null | undefined,
  subtotalAmount: number
): number {
  if (!promotion) return 0

  if (promotion.discount_type === 'fixed') {
    return promotion.discount_value ?? 0
  }

  if (promotion.discount_type === 'percentage') {
    const rawDiscount = subtotalAmount * ((promotion.discount_value ?? 0) / 100)
    return promotion.max_discount_cap == null
      ? rawDiscount
      : Math.min(rawDiscount, promotion.max_discount_cap)
  }

  return 0
}

export function getFirstOrderPromotionError(language: 'en' | 'ar'): string {
  return language === 'ar'
    ? 'عرض الترحيب متاح للطلب الأول فقط'
    : 'The welcome promotion is available only on your first order'
}
