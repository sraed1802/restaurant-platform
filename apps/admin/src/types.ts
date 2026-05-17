// apps/admin/src/types.ts
import type { DeliveryAddress, FulfillmentMode } from '@rms/supabase/types'

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'
export type DriverStatus = 'offline' | 'available' | 'busy' | 'break'
export type StaffRole = 'admin' | 'manager' | 'supervisor'

export interface Order {
  id: string
  status: OrderStatus
  customer_id: string | null
  driver_id: string | null
  promotion_id: string | null
  fulfillment_mode?: FulfillmentMode
  delivery_address: DeliveryAddress
  delivery_fee: number
  subtotal: number
  discount_amount: number
  total: number
  payment_method: string
  payment_status: string
  special_instructions: string | null
  language_pref: string
  created_at: string
  confirmed_at: string | null
  preparing_at: string | null
  ready_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  // Relations
  customer?: { name: string | null; phone_e164: string } | null
  driver?: { name: string; phone_e164: string } | null
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_snapshot: { name_en: string; name_ar: string; base_price: number }
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
}

export interface Product {
  id: string
  category_id: string
  name_en: string
  name_ar: string
  description_en: string | null
  description_ar: string | null
  base_price: number
  image_url: string | null
  is_available: boolean
  is_featured: boolean
  prep_time_minutes: number
  calories: number | null
  tags: string[]
  display_order: number
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name_en: string
  name_ar: string
  description_en: string | null
  description_ar: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
