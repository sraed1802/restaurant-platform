// packages/supabase/types.ts
// Auto-generated types matching the database schema

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'
export type DriverStatus = 'offline' | 'available' | 'busy' | 'break'
export type StaffRole = 'admin' | 'manager' | 'supervisor'
export type FulfillmentMode = 'outside_delivery' | 'hotel_room_delivery'
export type PaymentMethod = 'cash' | 'card' | 'online'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type DiscountType = 'fixed' | 'percentage' | 'free_delivery'
export type PromotionType = 'code' | 'automatic' | 'ai_suggested'
export type PromotionConditionType =
  | 'none'
  | 'first_order'
  | 'min_order'
  | 'specific_products'
  | 'specific_categories'
export type SelectionType = 'single' | 'multiple'
export type Language = 'en' | 'ar'

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
  stock_level?: number
  low_stock_threshold?: number
  stock_unit?: string
  last_stock_update?: string | null
  is_stock_tracked?: boolean
  created_at: string
  updated_at: string
  // Relations
  category?: Category
  modifier_groups?: ModifierGroupWithOptions[]
}

export interface ModifierGroup {
  id: string
  name_en: string
  name_ar: string
  selection_type: SelectionType
  min_selections: number
  max_selections: number
  is_required: boolean
  display_order: number
}

export interface ModifierOption {
  id: string
  group_id: string
  name_en: string
  name_ar: string
  price_delta: number
  is_default: boolean
  is_available: boolean
  display_order: number
}

export interface ModifierGroupWithOptions extends ModifierGroup {
  options: ModifierOption[]
}

export interface ComboRule {
  id: string
  name_en: string
  name_ar: string
  description_en: string | null
  description_ar: string | null
  trigger_product_ids: string[]
  reward_product_ids: string[]
  discount_value: number
  discount_type: DiscountType
  min_trigger_qty: number
  is_active: boolean
  priority: number
  valid_from: string | null
  valid_until: string | null
  created_at: string
}

export type ComboItemRole = 'main' | 'side' | 'drink' | 'dessert' | 'optional_drink'

export interface ComboPromotionItem {
  id: string
  combo_promotion_id: string
  product_id: string
  item_role: ComboItemRole
  quantity: number
  display_order: number
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  created_at: string
  product?: Product
}

export interface ComboPromotion {
  id: string
  name_en: string
  name_ar: string
  headline_en: string | null
  headline_ar: string | null
  description_en: string | null
  description_ar: string | null
  promo_price: number
  original_price: number
  image_url: string | null
  model_asset_url: string | null
  badge_text_en: string | null
  badge_text_ar: string | null
  accent_color: string | null
  secondary_color: string | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  is_featured: boolean
  display_order: number
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  created_at: string
  updated_at: string
  items?: ComboPromotionItem[]
}

export interface AppliedComboMatch {
  combo_promotion_id: string
  name_en: string
  name_ar: string
  quantity: number
  promo_price: number
  original_price: number
  savings: number
  matched_product_ids: string[]
}

export interface Promotion {
  id: string
  code: string | null
  name_en: string
  name_ar: string
  type: PromotionType
  discount_value: number
  discount_type: DiscountType
  min_order_value: number
  max_discount_cap: number | null
  usage_limit: number | null
  usage_count: number
  usage_limit_per_customer: number
  conditions: Record<string, unknown>
  ai_rank_score: number
  is_active: boolean
  is_featured: boolean
  condition_type: PromotionConditionType
  valid_from: string
  valid_until: string | null
  valid_from_time: string | null
  valid_until_time: string | null
  created_at: string
  updated_at: string
}

export interface PromotionProduct {
  promotion_id: string
  product_id: string
}

export interface PromotionCategory {
  promotion_id: string
  category_id: string
}

export interface Customer {
  id: string
  phone_e164: string
  name: string | null
  email: string | null
  delivery_addresses: DeliveryAddress[]
  language_pref: Language
  first_order_at: string | null
  last_order_at: string | null
  total_orders: number
  lifetime_value: number
  referral_code: string | null
  referral_credits: number
  preference_vector: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

interface DeliveryAddressBase {
  id?: string
  label?: string
  coordinates?: { lat: number; lng: number }
  instructions?: string
  is_default?: boolean
}

export interface OutsideDeliveryAddress extends DeliveryAddressBase {
  mode?: 'outside_delivery'
  street: string
  building: string
  floor?: string
  apartment?: string
  area: string
  city: string
}

export interface HotelRoomDeliveryAddress extends DeliveryAddressBase {
  mode: 'hotel_room_delivery'
  guest_name: string
  room_number: string
  hotel_name?: string
  tower?: string
  area?: string
  city?: string
}

export type DeliveryAddress = OutsideDeliveryAddress | HotelRoomDeliveryAddress

export interface Driver {
  id: string
  name: string
  phone_e164: string
  vehicle_type: string
  status: DriverStatus
  current_location: { lat: number; lng: number } | null
  active_order_id: string | null
  notes: string | null
  is_active: boolean
  last_active_at: string | null
  created_at: string
}

export interface Order {
  id: string
  customer_id: string | null
  driver_id: string | null
  promotion_id: string | null
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  fulfillment_mode: FulfillmentMode
  status: OrderStatus
  delivery_address: DeliveryAddress
  delivery_fee: number
  estimated_delivery_at: string | null
  subtotal: number
  discount_amount: number
  total: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  special_instructions: string | null
  language_pref: Language
  promo_code_entered: string | null
  created_at: string
  confirmed_at: string | null
  preparing_at: string | null
  ready_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  // Relations
  customer?: Customer
  driver?: Driver
  items?: OrderItemWithModifiers[]
  events?: OrderEvent[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_snapshot: Record<string, unknown>
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
}

export interface OrderItemModifier {
  id: string
  order_item_id: string
  modifier_option_id: string
  option_snapshot: Record<string, unknown>
  price_delta: number
}

export interface ProductModifierGroup {
  product_id: string
  group_id: string
  display_order: number
}

export interface OrderItemWithModifiers extends OrderItem {
  modifiers: OrderItemModifier[]
}

export interface OrderEvent {
  id: string
  order_id: string
  event_type: string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  actor_id: string | null
  actor_role: StaffRole | 'customer' | 'system' | null
  payload: Record<string, unknown>
  idempotency_key: string | null
  created_at: string
}

export interface AiSuggestionCache {
  id: string
  cache_key: string
  suggestion_payload: {
    ranked_products: Array<{ product_id: string; score: number; reasons: string[] }>
    ranked_promotions: Array<{ promotion_id: string; score: number }>
    computed_for_hour: number
    version: string
  }
  confidence_score: number
  computed_at: string
  expires_at: string
}

export interface SystemConfig {
  key: string
  value: unknown
  description: string | null
  updated_by: string | null
  updated_at: string
}

export interface Staff {
  id: string
  name: string
  phone: string | null
  app_role: StaffRole
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface RestaurantSettings {
  id: string
  restaurant_name_en: string
  restaurant_name_ar: string
  restaurant_tagline_en: string | null
  restaurant_tagline_ar: string | null
  logo_url: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_address_en: string | null
  contact_address_ar: string | null
  social_facebook: string | null
  social_instagram: string | null
  social_twitter: string | null
  social_whatsapp: string | null
  delivery_banner_enabled: boolean
  delivery_banner_text_en: string | null
  delivery_banner_text_ar: string | null
  delivery_threshold: number | null
  currency_code: string
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  background_color: string | null
  surface_color: string | null
  text_color: string | null
  text_muted_color: string | null
  border_color: string | null
  font_family: string | null
  heading_font: string | null
  enable_service_dine_in: boolean
  enable_service_takeaway: boolean
  enable_service_delivery: boolean
  hero_title_en: string | null
  hero_title_ar: string | null
  hero_subtitle_en: string | null
  hero_subtitle_ar: string | null
  hero_image_url: string | null
  cancellation_policy_en: string | null
  cancellation_policy_ar: string | null
  meta_description_en: string | null
  meta_description_ar: string | null
  updated_at: string
}

export interface FulfillmentSettings {
  id: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  fulfillment_mode: FulfillmentMode
  created_at: string
  updated_at: string
}

export interface HotelGuestRosterEntry {
  id: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  room_number: string
  guest_name: string
  phone: string | null
  email: string | null
  check_in_date: string | null
  check_out_date: string | null
  notes: string | null
  source_file_name: string | null
  created_at: string
  updated_at: string
}

export interface InventoryTransaction {
  id: string
  product_id: string
  transaction_type: 'purchase' | 'sale' | 'adjustment' | 'waste' | 'return'
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reason: string | null
  staff_id: string | null
  created_at: string
  notes: string | null
}

export interface LowStockAlert {
  id: string
  product_id: string
  current_stock: number
  threshold: number
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

export interface InventorySnapshot {
  id: string
  product_id: string
  stock_level: number
  snapshot_date: string
  created_at: string
}

export interface OperatorNotification {
  id: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  order_id: string
  event_type: 'order.created' | 'order.cancelled'
  audience_roles: string[]
  title: string
  message: string
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OperatorNotificationDelivery {
  id: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  order_id: string
  notification_id: string | null
  event_type: 'order.created' | 'order.cancelled'
  channel: 'in_app' | 'email' | 'telegram'
  recipient: string | null
  status: 'queued' | 'sent' | 'failed' | 'skipped'
  response_payload: Record<string, unknown>
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface OperatorNotificationSecret {
  key_name: 'telegram_bot_token'
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  ciphertext: string
  iv: string
  key_version: number
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface NotificationTemplate {
  id: string
  event_type: string
  subject_en: string | null
  body_en: string
  subject_ar: string | null
  body_ar: string
  channel: 'sms' | 'push' | 'both'
  is_active: boolean
  updated_at: string
}

export interface AuditLog {
  id: string
  action: string
  actor_id: string | null
  actor_role: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Payment {
  id: string
  order_id: string
  payment_provider: 'qpay' | 'dokhan' | 'other' | 'stripe'
  provider_transaction_id: string | null
  provider_payment_reference: string | null
  amount: number
  currency: string
  payment_method: PaymentMethod
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'cancelled'
  provider_response: Record<string, unknown> | null
  failure_code: string | null
  failure_message: string | null
  captured_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
  provider_session_id?: string | null
  stripe_payment_intent_id?: string | null
  stripe_checkout_session_id?: string | null
  idempotency_key?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CustomerAnalytics {
  id: string
  name: string | null
  phone: string | null
  first_order_date: string | null
  last_order_date: string | null
  total_orders: number
  total_spent: number
  average_order_value: number
}

export interface CustomerMetricsRow {
  total_customers: number
  new_customers_this_month: number
  repeat_customers: number
  average_orders_per_customer: number
  customer_retention_rate: number
  top_customers: Array<{
    customer_id: string
    name: string | null
    phone: string | null
    total_orders: number
    total_spent: number
    average_order_value: number
    last_order_date: string
  }>
}

export interface CustomerSegmentRow {
  segment: string
  count: number
  percentage: number
  characteristics: string[]
}

export interface CustomerCohortRow {
  cohort: string
  customers: number
  retention_rates: Array<{
    month: number
    rate: number
  }>
}

export interface CustomerLifetimeValueRow {
  total_customers: number
  average_ltv: number
  total_revenue: number
  monthly_ltv: Array<{
    month: string
    new_customers: number
    avg_ltv: number
  }>
}

// Analytics
export interface AnalyticsEvent {
  id: string
  event_type: string
  session_id: string | null
  customer_id: string | null
  entity_id: string | null
  entity_type: string | null
  properties: Record<string, unknown>
  occurred_at: string
  partition_date: string
}

// Materialized view shapes
export interface HourlyRevenue {
  hour_bucket: string
  order_count: number
  revenue: number
  avg_order_value: number
  total_discounts: number
}

export interface ProductPopularity {
  id: string
  name_en: string
  category_id: string
  order_count: number
  total_qty: number
  total_revenue: number
  avg_price: number
}

export interface PeakDemand {
  day_of_week: number
  hour_of_day: number
  order_count: number
  avg_order_value: number
}

// Cart types (client-side only)
export interface CartItem {
  cartItemId?: string
  product: Product
  quantity: number
  selectedModifiers: Record<string, string[]> // groupId -> optionIds
  notes: string
  lineTotal: number
}

export interface Cart {
  items: CartItem[]
  subtotal: number
  discountAmount: number
  deliveryFee: number
  total: number
  appliedPromotion: Promotion | null
  appliedCombos: AppliedComboMatch[]
}

// Database type map
type RelationshipDef = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type TableDef<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: RelationshipDef[]
}

type ViewDef<Row> = {
  Row: Row
  Insert: never
  Update: never
  Relationships: RelationshipDef[]
}

export interface Database {
  public: {
    Tables: {
      categories: TableDef<Category, Omit<Category, 'id' | 'created_at' | 'updated_at'>, Partial<Omit<Category, 'id'>>>
      analytics_events: TableDef<
        AnalyticsEvent,
        Omit<AnalyticsEvent, 'id'>,
        Partial<Omit<AnalyticsEvent, 'id'>>
      >
      ai_suggestion_cache: TableDef<
        AiSuggestionCache & { metadata: Record<string, unknown> },
        Omit<AiSuggestionCache & { metadata: Record<string, unknown> }, 'id'>,
        Partial<Omit<AiSuggestionCache & { metadata: Record<string, unknown> }, 'id'>>
      >
      audit_logs: TableDef<AuditLog, Omit<AuditLog, 'id' | 'created_at'>, Partial<Omit<AuditLog, 'id' | 'created_at'>>>
      combo_promotion_items: TableDef<
        ComboPromotionItem,
        Omit<ComboPromotionItem, 'id' | 'created_at' | 'product'>,
        Partial<Omit<ComboPromotionItem, 'id' | 'created_at' | 'product'>>
      >
      combo_promotions: TableDef<
        ComboPromotion,
        Omit<ComboPromotion, 'id' | 'created_at' | 'updated_at' | 'items'>,
        Partial<Omit<ComboPromotion, 'id' | 'items'>>
      >
      inventory_snapshots: TableDef<
        InventorySnapshot,
        Omit<InventorySnapshot, 'id' | 'created_at'>,
        Partial<Omit<InventorySnapshot, 'id' | 'created_at'>>
      >
      inventory_transactions: TableDef<
        InventoryTransaction,
        Omit<InventoryTransaction, 'id' | 'created_at'>,
        Partial<Omit<InventoryTransaction, 'id' | 'created_at'>>
      >
      low_stock_alerts: TableDef<
        LowStockAlert,
        Omit<LowStockAlert, 'id' | 'created_at'>,
        Partial<Omit<LowStockAlert, 'id' | 'created_at'>>
      >
      modifier_groups: TableDef<
        ModifierGroup,
        ModifierGroup,
        Partial<ModifierGroup>
      >
      modifier_options: TableDef<
        ModifierOption,
        Omit<ModifierOption, 'id'>,
        Partial<Omit<ModifierOption, 'id'>>
      >
      notification_templates: TableDef<
        NotificationTemplate,
        Omit<NotificationTemplate, 'id' | 'updated_at'>,
        Partial<Omit<NotificationTemplate, 'id' | 'updated_at'>>
      >
      operator_notification_deliveries: TableDef<
        OperatorNotificationDelivery,
        Omit<OperatorNotificationDelivery, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<OperatorNotificationDelivery, 'id' | 'created_at' | 'updated_at'>>
      >
      operator_notification_secrets: TableDef<
        OperatorNotificationSecret,
        Omit<OperatorNotificationSecret, 'created_at' | 'updated_at'>,
        Partial<Omit<OperatorNotificationSecret, 'created_at' | 'updated_at'>>
      >
      operator_notifications: TableDef<
        OperatorNotification,
        Omit<OperatorNotification, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<OperatorNotification, 'id' | 'created_at' | 'updated_at'>>
      >
      order_item_modifiers: TableDef<
        OrderItemModifier,
        Omit<OrderItemModifier, 'id'>,
        Partial<Omit<OrderItemModifier, 'id'>>
      >
      order_items: TableDef<
        OrderItem,
        Omit<OrderItem, 'id'>,
        Partial<Omit<OrderItem, 'id'>>
      >
      products: TableDef<Product, Omit<Product, 'id' | 'created_at' | 'updated_at'>, Partial<Omit<Product, 'id'>>>
      product_modifier_groups: TableDef<
        ProductModifierGroup,
        ProductModifierGroup,
        Partial<ProductModifierGroup>
      >
      orders: TableDef<Order, Omit<Order, 'id' | 'created_at'>, Partial<Omit<Order, 'id'>>>
      customers: TableDef<Customer, Omit<Customer, 'id' | 'created_at' | 'updated_at'>, Partial<Omit<Customer, 'id'>>>
      drivers: TableDef<Driver, Omit<Driver, 'id' | 'created_at'>, Partial<Omit<Driver, 'id'>>>
      payments: TableDef<
        Payment,
        Omit<Payment, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>
      >
      order_events: TableDef<
        OrderEvent,
        Omit<OrderEvent, 'id' | 'created_at'>,
        Partial<Omit<OrderEvent, 'id' | 'created_at'>>
      >
      promotion_categories: TableDef<PromotionCategory, PromotionCategory, Partial<PromotionCategory>>
      promotion_products: TableDef<PromotionProduct, PromotionProduct, Partial<PromotionProduct>>
      promotions: TableDef<
        Promotion,
        Omit<Promotion, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<Promotion, 'id'>>
      >
      fulfillment_settings: TableDef<
        FulfillmentSettings,
        Omit<FulfillmentSettings, 'id' | 'created_at' | 'updated_at'> & { id?: string },
        Partial<Omit<FulfillmentSettings, 'id'>>
      >
      hotel_guest_roster: TableDef<
        HotelGuestRosterEntry,
        Omit<HotelGuestRosterEntry, 'id' | 'created_at' | 'updated_at'> & { id?: string },
        Partial<Omit<HotelGuestRosterEntry, 'id'>>
      >
      restaurant_settings: TableDef<
        RestaurantSettings,
        Omit<RestaurantSettings, 'id' | 'updated_at'> & { id?: string },
        Partial<Omit<RestaurantSettings, 'id'>>
      >
      staff: TableDef<
        Staff,
        Omit<Staff, 'created_at'>,
        Partial<Omit<Staff, 'created_at'>>
      >
      system_config: TableDef<
        SystemConfig,
        Omit<SystemConfig, 'updated_at'>,
        Partial<Omit<SystemConfig, 'updated_at'>>
      >
    }
    Views: {
      customer_analytics: ViewDef<CustomerAnalytics>
      mv_hourly_revenue: ViewDef<HourlyRevenue>
      mv_peak_demand: ViewDef<PeakDemand>
      mv_product_popularity: ViewDef<ProductPopularity>
    }
    Functions: {
      apply_referral_credits: {
        Args: {
          p_customer_id: string
          p_order_id: string
          p_amount_to_apply: number
        }
        Returns: number
      }
      create_customer_referral_code: {
        Args: {
          p_customer_id: string
        }
        Returns: string
      }
      get_cohort_analysis: {
        Args: Record<string, never>
        Returns: CustomerCohortRow[]
      }
      get_customer_lifetime_value: {
        Args: Record<string, never>
        Returns: CustomerLifetimeValueRow[]
      }
      get_customer_metrics: {
        Args: { p_days?: number }
        Returns: CustomerMetricsRow[]
      }
      get_referral_stats: {
        Args: {
          p_customer_id?: string | null
        }
        Returns: Array<{
          total_referrals: number
          active_referrals: number
          total_rewards: number
          pending_rewards: number
          referral_code: string
          referral_link: string
        }>
      }
      get_customer_segments: {
        Args: Record<string, never>
        Returns: CustomerSegmentRow[]
      }
      crm_list_customers: {
        Args: { p_limit: number }
        Returns: Array<{
          id: string
          name: string | null
          email: string | null
          phone_e164: string | null
          total_orders: number
          last_order_at: string | null
          created_at: string
          marketing_opt_out: boolean
          is_registered: boolean
        }>
      }
      process_referral: {
        Args: {
          p_referral_code: string
          p_referred_id: string
          p_order_id?: string | null
        }
        Returns: Array<{
          success: boolean
          message: string
          reward_amount: number
        }>
      }
      update_product_stock: {
        Args: {
          p_product_id: string
          p_quantity_change: number
          p_transaction_type: 'purchase' | 'sale' | 'adjustment' | 'waste' | 'return'
          p_reason?: string | null
          p_staff_id?: string | null
          p_notes?: string | null
        }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
