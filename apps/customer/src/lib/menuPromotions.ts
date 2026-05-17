import type { Promotion } from '../../types'
import type { ProductWithModifiers } from '../components/menu/types'

export type PromotionRow = Promotion & {
  product_ids?: string[]
  category_ids?: string[]
  condition_type?: string
}

export function calculatePromotionalPrice(
  product: ProductWithModifiers,
  promotions: PromotionRow[]
): number {
  const applicablePromo = promotions.find((promo) => {
    if (promo.product_ids?.includes(product.id)) return true
    if (promo.category_ids?.includes(product.category_id)) return true
    if (promo.condition_type === 'none' || promo.condition_type === 'min_order') return true
    return false
  })

  if (!applicablePromo) return product.base_price

  const { discount_type, discount_value } = applicablePromo
  if (discount_type === 'percentage') {
    return product.base_price * (1 - discount_value / 100)
  }
  if (discount_type === 'fixed') {
    return Math.max(0, product.base_price - discount_value)
  }
  return product.base_price
}
