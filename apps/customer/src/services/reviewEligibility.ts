import { supabase } from '../lib/supabase'
import { asRows } from '../lib/supabaseTypeWorkarounds'

export type ReviewableProductMeta = {
  productId: string
  /** Most recent delivered order that included this product */
  orderId: string
  hasReviewed: boolean
}

type OrderItemRow = {
  product_id: string | null
  product_snapshot: { id?: string } | null
}

type DeliveredOrderRow = {
  id: string
  created_at: string
  order_items: OrderItemRow[] | null
}

function productIdFromItem(item: OrderItemRow): string | null {
  if (item.product_id) return item.product_id
  const snapshotId = item.product_snapshot?.id
  return typeof snapshotId === 'string' && snapshotId.trim() ? snapshotId : null
}

/**
 * Products the customer may review: distinct items from delivered (successful) orders only.
 */
export async function fetchReviewableProducts(
  customerId: string
): Promise<Map<string, ReviewableProductMeta>> {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id,
      created_at,
      order_items (
        product_id,
        product_snapshot
      )
    `)
    .eq('customer_id', customerId)
    .eq('status', 'delivered')
    .order('created_at', { ascending: false })

  if (ordersError) throw ordersError

  const byProduct = new Map<string, ReviewableProductMeta>()

  for (const order of asRows<DeliveredOrderRow>(orders)) {
    for (const item of order.order_items ?? []) {
      const productId = productIdFromItem(item)
      if (!productId || byProduct.has(productId)) continue
      byProduct.set(productId, {
        productId,
        orderId: order.id,
        hasReviewed: false,
      })
    }
  }

  const productIds = [...byProduct.keys()]
  if (productIds.length === 0) return byProduct

  const { data: existingReviews, error: reviewsError } = await supabase
    .from('customer_reviews')
    .select('product_id')
    .eq('customer_id', customerId)
    .in('product_id', productIds)

  if (reviewsError) throw reviewsError

  for (const row of asRows<{ product_id: string }>(existingReviews)) {
    const entry = byProduct.get(row.product_id)
    if (entry) {
      byProduct.set(row.product_id, { ...entry, hasReviewed: true })
    }
  }

  return byProduct
}

export async function fetchReviewEligibilityForProduct(
  customerId: string,
  productId: string
): Promise<ReviewableProductMeta | null> {
  const all = await fetchReviewableProducts(customerId)
  return all.get(productId) ?? null
}
