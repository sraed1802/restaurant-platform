import { supabase } from '../lib/supabase'
import { asRows } from '../lib/supabaseTypeWorkarounds'

export interface AdminCustomerReviewRow {
  id: string
  rating: number
  title: string | null
  comment: string | null
  created_at: string
  is_verified: boolean
  is_featured: boolean
  customer_id: string
  product_id: string
  order_id: string | null
  guest_name: string
  product_name_en: string
  product_name_ar: string
}

export interface ProductReviewSummaryRow {
  product_id: string
  product_name_en: string
  product_name_ar: string
  review_count: number
  average_rating: number
}

type RawReviewRow = {
  id: string
  rating: number
  title: string | null
  comment: string | null
  created_at: string
  is_verified: boolean
  is_featured: boolean
  customer_id: string
  product_id: string
  order_id: string | null
  products: { name_en: string; name_ar: string } | Array<{ name_en: string; name_ar: string }> | null
}

function productNames(
  products: RawReviewRow['products']
): { name_en: string; name_ar: string } {
  const row = Array.isArray(products) ? products[0] : products
  return {
    name_en: row?.name_en ?? 'Unknown item',
    name_ar: row?.name_ar ?? row?.name_en ?? 'Unknown item',
  }
}

export async function listAdminCustomerReviews(): Promise<AdminCustomerReviewRow[]> {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select(`
      id,
      rating,
      title,
      comment,
      created_at,
      is_verified,
      is_featured,
      customer_id,
      product_id,
      order_id,
      products (
        name_en,
        name_ar
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  const customerIds = [
    ...new Set(asRows<RawReviewRow>(data).map((row) => row.customer_id).filter(Boolean)),
  ]

  const nameByCustomerId = new Map<string, string>()
  if (customerIds.length > 0) {
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, email')
      .in('id', customerIds)

    if (customersError) throw customersError

    for (const customer of asRows<{ id: string; name: string | null; email: string | null }>(customers)) {
      const label =
        customer.name?.trim() ||
        customer.email?.trim() ||
        `Guest ${customer.id.slice(0, 8)}`
      nameByCustomerId.set(customer.id, label)
    }
  }

  return asRows<RawReviewRow>(data).map((row) => {
    const names = productNames(row.products)
    return {
      id: row.id,
      rating: row.rating,
      title: row.title,
      comment: row.comment,
      created_at: row.created_at,
      is_verified: row.is_verified,
      is_featured: row.is_featured,
      customer_id: row.customer_id,
      product_id: row.product_id,
      order_id: row.order_id,
      guest_name: nameByCustomerId.get(row.customer_id) ?? `Guest ${row.customer_id.slice(0, 8)}`,
      product_name_en: names.name_en,
      product_name_ar: names.name_ar,
    }
  })
}

export function summarizeReviewsByProduct(
  reviews: AdminCustomerReviewRow[]
): ProductReviewSummaryRow[] {
  const byProduct = new Map<string, ProductReviewSummaryRow & { ratingSum: number }>()

  for (const review of reviews) {
    const existing = byProduct.get(review.product_id)
    if (!existing) {
      byProduct.set(review.product_id, {
        product_id: review.product_id,
        product_name_en: review.product_name_en,
        product_name_ar: review.product_name_ar,
        review_count: 1,
        average_rating: review.rating,
        ratingSum: review.rating,
      })
      continue
    }

    existing.review_count += 1
    existing.ratingSum += review.rating
    existing.average_rating = existing.ratingSum / existing.review_count
  }

  return [...byProduct.values()]
    .map(({ ratingSum: _ratingSum, ...row }) => row)
    .sort((a, b) => b.review_count - a.review_count || b.average_rating - a.average_rating)
}
