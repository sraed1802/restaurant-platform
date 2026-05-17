-- ============================================================
-- Restaurant Claude business onboarding template
-- Companion to: supabase/recreate_database_no_sample_data.sql
--
-- Purpose:
--   Populate a fresh Supabase project with restaurant-specific business data
--   after the platform schema/bootstrap SQL has already been applied.
--
-- What this template covers:
--   - restaurant branding/contact/settings
--   - delivery + payment + operator runtime config
--   - feature flags
--   - order availability defaults
--   - staff records (after Auth users exist)
--   - menu/catalog skeleton
--   - promotions skeleton
--   - combo promotions skeleton
--
-- Important:
--   1. Review and replace all __PLACEHOLDER__ values before running.
--   2. Create Auth users first, then map them into public.staff.
--   3. Keep tenant scope values consistent with your app env values:
--        VITE_ORGANIZATION_ID
--        VITE_CLUSTER_ID
--        VITE_PROPERTY_ID
--   4. Use your own stable UUIDs for categories/products/promotions/combos.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Tenant scope for tenant-aware tables
-- Replace these three values once, then reuse them throughout this file.
-- If you intentionally run a single global project with no tenant pinning,
-- replace them with NULL in every insert/upsert below.
-- ============================================================

-- organization_id: __ORG_UUID__
-- cluster_id:      __CLUSTER_UUID__
-- property_id:     __PROPERTY_UUID__

-- ============================================================
-- 1. Restaurant settings (singleton row used by customer/admin apps)
-- This table is effectively global in the current codebase.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM restaurant_settings) THEN
    UPDATE restaurant_settings
    SET
      restaurant_name_en = '__RESTAURANT_NAME_EN__',
      restaurant_name_ar = '__RESTAURANT_NAME_AR__',
      restaurant_tagline_en = '__TAGLINE_EN__',
      restaurant_tagline_ar = '__TAGLINE_AR__',
      logo_url = '__LOGO_URL_OR_NULL__',
      contact_phone = '__CONTACT_PHONE__',
      contact_email = '__CONTACT_EMAIL__',
      contact_address_en = '__CONTACT_ADDRESS_EN__',
      contact_address_ar = '__CONTACT_ADDRESS_AR__',
      social_facebook = '__FACEBOOK_URL_OR_NULL__',
      social_instagram = '__INSTAGRAM_URL_OR_NULL__',
      social_twitter = '__TWITTER_URL_OR_NULL__',
      social_whatsapp = '__WHATSAPP_URL_OR_NULL__',
      delivery_banner_enabled = false,
      delivery_banner_text_en = '__DELIVERY_BANNER_EN__',
      delivery_banner_text_ar = '__DELIVERY_BANNER_AR__',
      delivery_threshold = 50,
      currency_code = 'QAR',
      primary_color = '#b8975a',
      secondary_color = '#d4a574',
      accent_color = '#c19a6b',
      background_color = '#faf8f4',
      surface_color = '#ffffff',
      text_color = '#2c1810',
      text_muted_color = '#6b5d54',
      border_color = '#e5ddd5',
      font_family = 'Inter, system-ui, sans-serif',
      heading_font = 'Playfair Display, serif',
      enable_service_dine_in = true,
      enable_service_takeaway = true,
      enable_service_delivery = true,
      hero_title_en = '__HERO_TITLE_EN__',
      hero_title_ar = '__HERO_TITLE_AR__',
      hero_subtitle_en = '__HERO_SUBTITLE_EN__',
      hero_subtitle_ar = '__HERO_SUBTITLE_AR__',
      hero_image_url = '__HERO_IMAGE_URL_OR_NULL__',
      cancellation_policy_en = '__CANCELLATION_POLICY_EN__',
      cancellation_policy_ar = '__CANCELLATION_POLICY_AR__',
      meta_description_en = '__META_DESCRIPTION_EN__',
      meta_description_ar = '__META_DESCRIPTION_AR__',
      updated_at = now();
  ELSE
    INSERT INTO restaurant_settings (
      restaurant_name_en,
      restaurant_name_ar,
      restaurant_tagline_en,
      restaurant_tagline_ar,
      logo_url,
      contact_phone,
      contact_email,
      contact_address_en,
      contact_address_ar,
      social_facebook,
      social_instagram,
      social_twitter,
      social_whatsapp,
      delivery_banner_enabled,
      delivery_banner_text_en,
      delivery_banner_text_ar,
      delivery_threshold,
      currency_code,
      primary_color,
      secondary_color,
      accent_color,
      background_color,
      surface_color,
      text_color,
      text_muted_color,
      border_color,
      font_family,
      heading_font,
      enable_service_dine_in,
      enable_service_takeaway,
      enable_service_delivery,
      hero_title_en,
      hero_title_ar,
      hero_subtitle_en,
      hero_subtitle_ar,
      hero_image_url,
      cancellation_policy_en,
      cancellation_policy_ar,
      meta_description_en,
      meta_description_ar
    ) VALUES (
      '__RESTAURANT_NAME_EN__',
      '__RESTAURANT_NAME_AR__',
      '__TAGLINE_EN__',
      '__TAGLINE_AR__',
      '__LOGO_URL_OR_NULL__',
      '__CONTACT_PHONE__',
      '__CONTACT_EMAIL__',
      '__CONTACT_ADDRESS_EN__',
      '__CONTACT_ADDRESS_AR__',
      '__FACEBOOK_URL_OR_NULL__',
      '__INSTAGRAM_URL_OR_NULL__',
      '__TWITTER_URL_OR_NULL__',
      '__WHATSAPP_URL_OR_NULL__',
      false,
      '__DELIVERY_BANNER_EN__',
      '__DELIVERY_BANNER_AR__',
      50,
      'QAR',
      '#b8975a',
      '#d4a574',
      '#c19a6b',
      '#faf8f4',
      '#ffffff',
      '#2c1810',
      '#6b5d54',
      '#e5ddd5',
      'Inter, system-ui, sans-serif',
      'Playfair Display, serif',
      true,
      true,
      true,
      '__HERO_TITLE_EN__',
      '__HERO_TITLE_AR__',
      '__HERO_SUBTITLE_EN__',
      '__HERO_SUBTITLE_AR__',
      '__HERO_IMAGE_URL_OR_NULL__',
      '__CANCELLATION_POLICY_EN__',
      '__CANCELLATION_POLICY_AR__',
      '__META_DESCRIPTION_EN__',
      '__META_DESCRIPTION_AR__'
    );
  END IF;
END $$;

-- ============================================================
-- 2. Runtime config stored in system_config
-- ============================================================

INSERT INTO system_config (key, value, description)
VALUES
  ('delivery_fee', to_jsonb(5.000::numeric), 'Fixed delivery fee in QAR'),
  ('free_delivery_enabled', 'false'::jsonb, 'Enable free delivery for all orders'),
  ('free_delivery_min_order', to_jsonb(0.000::numeric), 'Minimum order value for free delivery'),
  (
    'payment_gateway_settings',
    jsonb_build_object(
      'stripe_enabled', false,
      'stripe_mode', 'test',
      'checkout_label', 'Pay online with Stripe'
    ),
    'Stripe checkout runtime settings for guest ordering'
  ),
  (
    'operator_notifications',
    jsonb_build_object(
      'email_enabled', false,
      'email_recipients', jsonb_build_array(),
      'telegram_enabled', false,
      'telegram_chat_ids', jsonb_build_array(),
      'notify_on_order_created', true,
      'notify_on_order_cancelled', true
    ),
    'Operator notification channel settings'
  )
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

-- ============================================================
-- 3. Feature flags for this restaurant/property
-- Keep or remove rows depending on which features you plan to enable.
-- ============================================================

INSERT INTO feature_flags (
  flag_key,
  description,
  enabled,
  rollout_percentage,
  rules,
  organization_id,
  cluster_id,
  property_id
) VALUES
  ('stripePayments', 'Enable Stripe-hosted checkout', false, 100, '{}'::jsonb, '__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__'),
  ('orderScheduling', 'Enable restaurant order availability scheduling', true, 100, '{}'::jsonb, '__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__'),
  ('multiLocation', 'Enable multi-location behavior', false, 100, '{}'::jsonb, '__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__')
ON CONFLICT (flag_key, organization_id, cluster_id, property_id)
DO UPDATE SET
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  rollout_percentage = EXCLUDED.rollout_percentage,
  rules = EXCLUDED.rules,
  updated_at = now();

-- ============================================================
-- 4. Order availability defaults for this property
-- ============================================================

INSERT INTO order_availability_settings (
  organization_id,
  cluster_id,
  property_id,
  manual_mode,
  timezone,
  closure_message_en,
  closure_message_ar
) VALUES (
  '__ORG_UUID__',
  '__CLUSTER_UUID__',
  '__PROPERTY_UUID__',
  'scheduled',
  'Asia/Qatar',
  'Orders are currently closed.',
  'الطلبات مغلقة حالياً.'
)
ON CONFLICT (organization_id, cluster_id, property_id)
DO UPDATE SET
  manual_mode = EXCLUDED.manual_mode,
  timezone = EXCLUDED.timezone,
  closure_message_en = EXCLUDED.closure_message_en,
  closure_message_ar = EXCLUDED.closure_message_ar,
  updated_at = now();

DELETE FROM order_availability_weekly_windows
WHERE organization_id = '__ORG_UUID__'
  AND cluster_id = '__CLUSTER_UUID__'
  AND property_id = '__PROPERTY_UUID__';

INSERT INTO order_availability_weekly_windows (
  organization_id,
  cluster_id,
  property_id,
  day_of_week,
  opens_at,
  closes_at,
  is_enabled
) VALUES
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 0, '10:00', '23:00', true),
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 1, '10:00', '23:00', true),
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 2, '10:00', '23:00', true),
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 3, '10:00', '23:00', true),
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 4, '10:00', '23:00', true),
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 5, '10:00', '23:59', true),
  ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', 6, '10:00', '23:59', true);

-- Example overrides (optional)
-- INSERT INTO order_availability_overrides (
--   organization_id,
--   cluster_id,
--   property_id,
--   starts_at,
--   ends_at,
--   mode,
--   label,
--   message_en,
--   message_ar
-- ) VALUES
--   ('__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', '2026-06-16T00:00:00+03:00', '2026-06-16T23:59:59+03:00', 'closed', 'Eid holiday', 'Closed for Eid holiday.', 'مغلق بمناسبة عطلة العيد.');

-- ============================================================
-- 5. Staff records
-- Auth users must exist first in auth.users.
-- Replace the UUIDs below with real auth.users.id values.
-- ============================================================

-- INSERT INTO staff (id, name, phone, app_role, is_active, created_by)
-- VALUES
--   ('__AUTH_USER_UUID_ADMIN__', '__ADMIN_NAME__', '__ADMIN_PHONE__', 'admin', true, NULL),
--   ('__AUTH_USER_UUID_MANAGER__', '__MANAGER_NAME__', '__MANAGER_PHONE__', 'manager', true, '__AUTH_USER_UUID_ADMIN__')
-- ON CONFLICT (id) DO UPDATE
-- SET
--   name = EXCLUDED.name,
--   phone = EXCLUDED.phone,
--   app_role = EXCLUDED.app_role,
--   is_active = EXCLUDED.is_active;

-- ============================================================
-- 6. Catalog skeleton
-- Use your own stable UUIDs.
-- Duplicate these patterns for the full restaurant menu.
-- ============================================================

-- 6a. Categories
-- INSERT INTO categories (id, name_en, name_ar, description_en, description_ar, image_url, display_order, is_active)
-- VALUES
--   ('00000000-0000-0000-0000-000000000101', 'Starters', 'المقبلات', 'Opening dishes', 'المقبلات الافتتاحية', NULL, 1, true),
--   ('00000000-0000-0000-0000-000000000102', 'Mains', 'الأطباق الرئيسية', 'Main dishes', 'الأطباق الرئيسية', NULL, 2, true)
-- ON CONFLICT (id) DO UPDATE
-- SET
--   name_en = EXCLUDED.name_en,
--   name_ar = EXCLUDED.name_ar,
--   description_en = EXCLUDED.description_en,
--   description_ar = EXCLUDED.description_ar,
--   image_url = EXCLUDED.image_url,
--   display_order = EXCLUDED.display_order,
--   is_active = EXCLUDED.is_active,
--   updated_at = now();

-- 6b. Products
-- INSERT INTO products (
--   id,
--   category_id,
--   name_en,
--   name_ar,
--   description_en,
--   description_ar,
--   base_price,
--   image_url,
--   is_available,
--   is_featured,
--   prep_time_minutes,
--   calories,
--   tags,
--   display_order
-- ) VALUES
--   (
--     '00000000-0000-0000-0000-000000000201',
--     '00000000-0000-0000-0000-000000000101',
--     'Soup of the Day',
--     'شوربة اليوم',
--     'Daily fresh soup',
--     'شوربة طازجة يومية',
--     18.000,
--     NULL,
--     true,
--     false,
--     10,
--     NULL,
--     '["vegetarian"]'::jsonb,
--     1
--   )
-- ON CONFLICT (id) DO UPDATE
-- SET
--   category_id = EXCLUDED.category_id,
--   name_en = EXCLUDED.name_en,
--   name_ar = EXCLUDED.name_ar,
--   description_en = EXCLUDED.description_en,
--   description_ar = EXCLUDED.description_ar,
--   base_price = EXCLUDED.base_price,
--   image_url = EXCLUDED.image_url,
--   is_available = EXCLUDED.is_available,
--   is_featured = EXCLUDED.is_featured,
--   prep_time_minutes = EXCLUDED.prep_time_minutes,
--   calories = EXCLUDED.calories,
--   tags = EXCLUDED.tags,
--   display_order = EXCLUDED.display_order,
--   updated_at = now();

-- 6c. Modifier groups + options
-- INSERT INTO modifier_groups (id, name_en, name_ar, selection_type, min_selections, max_selections, is_required, display_order)
-- VALUES
--   ('00000000-0000-0000-0000-000000000301', 'Size', 'الحجم', 'single', 1, 1, true, 1)
-- ON CONFLICT (id) DO UPDATE
-- SET
--   name_en = EXCLUDED.name_en,
--   name_ar = EXCLUDED.name_ar,
--   selection_type = EXCLUDED.selection_type,
--   min_selections = EXCLUDED.min_selections,
--   max_selections = EXCLUDED.max_selections,
--   is_required = EXCLUDED.is_required,
--   display_order = EXCLUDED.display_order;

-- INSERT INTO modifier_options (id, group_id, name_en, name_ar, price_delta, is_default, is_available, display_order)
-- VALUES
--   ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', 'Regular', 'عادي', 0.000, true, true, 1),
--   ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', 'Large', 'كبير', 5.000, false, true, 2)
-- ON CONFLICT (id) DO UPDATE
-- SET
--   group_id = EXCLUDED.group_id,
--   name_en = EXCLUDED.name_en,
--   name_ar = EXCLUDED.name_ar,
--   price_delta = EXCLUDED.price_delta,
--   is_default = EXCLUDED.is_default,
--   is_available = EXCLUDED.is_available,
--   display_order = EXCLUDED.display_order;

-- INSERT INTO product_modifier_groups (product_id, group_id, display_order)
-- VALUES
--   ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 1)
-- ON CONFLICT (product_id, group_id) DO UPDATE
-- SET display_order = EXCLUDED.display_order;

-- ============================================================
-- 7. Promotions skeleton
-- ============================================================

-- INSERT INTO promotions (
--   id,
--   code,
--   name_en,
--   name_ar,
--   type,
--   discount_value,
--   discount_type,
--   min_order_value,
--   max_discount_cap,
--   usage_limit,
--   usage_limit_per_customer,
--   conditions,
--   ai_rank_score,
--   is_active,
--   is_featured,
--   condition_type,
--   valid_from,
--   valid_until,
--   valid_from_time,
--   valid_until_time
-- ) VALUES
--   (
--     '00000000-0000-0000-0000-000000000501',
--     'WELCOME10',
--     'Welcome 10%',
--     'خصم ترحيبي 10%',
--     'code',
--     10.000,
--     'percentage',
--     0.000,
--     NULL,
--     NULL,
--     1,
--     '{}'::jsonb,
--     0.8000,
--     true,
--     false,
--     'none',
--     now(),
--     NULL,
--     NULL,
--     NULL
--   )
-- ON CONFLICT (id) DO UPDATE
-- SET
--   code = EXCLUDED.code,
--   name_en = EXCLUDED.name_en,
--   name_ar = EXCLUDED.name_ar,
--   type = EXCLUDED.type,
--   discount_value = EXCLUDED.discount_value,
--   discount_type = EXCLUDED.discount_type,
--   min_order_value = EXCLUDED.min_order_value,
--   max_discount_cap = EXCLUDED.max_discount_cap,
--   usage_limit = EXCLUDED.usage_limit,
--   usage_limit_per_customer = EXCLUDED.usage_limit_per_customer,
--   conditions = EXCLUDED.conditions,
--   ai_rank_score = EXCLUDED.ai_rank_score,
--   is_active = EXCLUDED.is_active,
--   is_featured = EXCLUDED.is_featured,
--   condition_type = EXCLUDED.condition_type,
--   valid_from = EXCLUDED.valid_from,
--   valid_until = EXCLUDED.valid_until,
--   valid_from_time = EXCLUDED.valid_from_time,
--   valid_until_time = EXCLUDED.valid_until_time,
--   updated_at = now();

-- Optional promo mappings
-- INSERT INTO promotion_products (promotion_id, product_id)
-- VALUES
--   ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000201')
-- ON CONFLICT (promotion_id, product_id) DO NOTHING;

-- ============================================================
-- 8. Combo promotions skeleton (tenant-aware)
-- ============================================================

-- INSERT INTO combo_promotions (
--   id,
--   organization_id,
--   cluster_id,
--   property_id,
--   name_en,
--   name_ar,
--   headline_en,
--   headline_ar,
--   description_en,
--   description_ar,
--   promo_price,
--   original_price,
--   image_url,
--   model_asset_url,
--   badge_text_en,
--   badge_text_ar,
--   accent_color,
--   secondary_color,
--   starts_at,
--   ends_at,
--   is_active,
--   is_featured,
--   display_order
-- ) VALUES
--   (
--     '00000000-0000-0000-0000-000000000601',
--     '__ORG_UUID__',
--     '__CLUSTER_UUID__',
--     '__PROPERTY_UUID__',
--     'Lunch Combo',
--     'كومبو الغداء',
--     'Main + side + drink',
--     'طبق رئيسي + جانبي + مشروب',
--     'High-conversion combo offer',
--     'عرض كومبو مميز',
--     35.000,
--     42.000,
--     NULL,
--     NULL,
--     'Save 7 QAR',
--     'وفّر 7 ريال',
--     '#B8975A',
--     '#6D28D9',
--     NULL,
--     NULL,
--     true,
--     true,
--     1
--   )
-- ON CONFLICT (id) DO UPDATE
-- SET
--   name_en = EXCLUDED.name_en,
--   name_ar = EXCLUDED.name_ar,
--   headline_en = EXCLUDED.headline_en,
--   headline_ar = EXCLUDED.headline_ar,
--   description_en = EXCLUDED.description_en,
--   description_ar = EXCLUDED.description_ar,
--   promo_price = EXCLUDED.promo_price,
--   original_price = EXCLUDED.original_price,
--   image_url = EXCLUDED.image_url,
--   model_asset_url = EXCLUDED.model_asset_url,
--   badge_text_en = EXCLUDED.badge_text_en,
--   badge_text_ar = EXCLUDED.badge_text_ar,
--   accent_color = EXCLUDED.accent_color,
--   secondary_color = EXCLUDED.secondary_color,
--   starts_at = EXCLUDED.starts_at,
--   ends_at = EXCLUDED.ends_at,
--   is_active = EXCLUDED.is_active,
--   is_featured = EXCLUDED.is_featured,
--   display_order = EXCLUDED.display_order,
--   updated_at = now();

-- INSERT INTO combo_promotion_items (
--   id,
--   organization_id,
--   cluster_id,
--   property_id,
--   combo_promotion_id,
--   product_id,
--   item_role,
--   quantity,
--   display_order
-- ) VALUES
--   ('00000000-0000-0000-0000-000000000701', '__ORG_UUID__', '__CLUSTER_UUID__', '__PROPERTY_UUID__', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000201', 'main', 1, 1)
-- ON CONFLICT (id) DO UPDATE
-- SET
--   combo_promotion_id = EXCLUDED.combo_promotion_id,
--   product_id = EXCLUDED.product_id,
--   item_role = EXCLUDED.item_role,
--   quantity = EXCLUDED.quantity,
--   display_order = EXCLUDED.display_order;

COMMIT;
