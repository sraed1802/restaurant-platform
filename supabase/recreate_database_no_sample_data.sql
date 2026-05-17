-- ============================================================
-- Restaurant Claude Supabase bootstrap (no sample restaurant data)
-- Generated from supabase/migrations in lexical order.
-- Included: schema, relationships, functions, RLS, storage, defaults, feature/config tables.
-- Excluded: 002_seed_data.sql, 012_add_sample_promotion_products.sql, 025_maazym_menu_catalog.sql
--
-- IMPORTANT: SQL alone does not deploy Edge Functions or project secrets.
-- After running this on a new Supabase project, also deploy supabase/functions and configure:
-- - Auth hook wiring for auth-hook
-- - Stripe/QPay webhook endpoints and secrets
-- - OPERATOR_SECRETS_MASTER_KEY and payment/email/Twilio secrets
-- - Any project/app env vars pointing to the new Supabase URL/keys
-- - Database/project settings expected by the delivered-order trigger:
--     app.supabase_url
--     app.service_role_key
-- ============================================================


-- ============================================================
-- BEGIN MIGRATION: 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- RMS Platform - Complete Database Schema
-- Restaurant Management System | Qatar
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CATALOG DOMAIN
-- ============================================================

CREATE TABLE categories (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  description_en text,
  description_ar text,
  image_url     text,
  display_order int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  description_en  text,
  description_ar  text,
  base_price      numeric(10,3) NOT NULL CHECK (base_price >= 0),
  image_url       text,
  is_available    boolean NOT NULL DEFAULT true,
  is_featured     boolean NOT NULL DEFAULT false,
  prep_time_minutes int NOT NULL DEFAULT 15,
  calories        int,
  tags            jsonb NOT NULL DEFAULT '[]',
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE modifier_groups (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  selection_type  text NOT NULL CHECK (selection_type IN ('single', 'multiple')),
  min_selections  int NOT NULL DEFAULT 0,
  max_selections  int NOT NULL DEFAULT 1,
  is_required     boolean NOT NULL DEFAULT false,
  display_order   int NOT NULL DEFAULT 0
);

CREATE TABLE modifier_options (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  price_delta     numeric(10,3) NOT NULL DEFAULT 0,
  is_default      boolean NOT NULL DEFAULT false,
  is_available    boolean NOT NULL DEFAULT true,
  display_order   int NOT NULL DEFAULT 0
);

CREATE TABLE product_modifier_groups (
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  display_order   int NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

-- ============================================================
-- COMBO ENGINE
-- ============================================================

CREATE TABLE combo_rules (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en             text NOT NULL,
  name_ar             text NOT NULL,
  description_en      text,
  description_ar      text,
  trigger_product_ids uuid[] NOT NULL,
  reward_product_ids  uuid[] NOT NULL,
  discount_value      numeric(10,3) NOT NULL,
  discount_type       text NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  min_trigger_qty     int NOT NULL DEFAULT 1,
  is_active           boolean NOT NULL DEFAULT true,
  priority            int NOT NULL DEFAULT 0,
  valid_from          timestamptz,
  valid_until         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROMOTIONS ENGINE
-- ============================================================

CREATE TABLE promotions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                text UNIQUE,
  name_en             text NOT NULL,
  name_ar             text NOT NULL,
  type                text NOT NULL CHECK (type IN ('code', 'automatic', 'ai_suggested')),
  discount_value      numeric(10,3) NOT NULL,
  discount_type       text NOT NULL CHECK (discount_type IN ('fixed', 'percentage', 'free_delivery')),
  min_order_value     numeric(10,3) NOT NULL DEFAULT 0,
  max_discount_cap    numeric(10,3),
  usage_limit         int,
  usage_count         int NOT NULL DEFAULT 0,
  usage_limit_per_customer int NOT NULL DEFAULT 1,
  conditions          jsonb NOT NULL DEFAULT '{}',
  ai_rank_score       numeric(5,4) NOT NULL DEFAULT 0.5,
  is_active           boolean NOT NULL DEFAULT true,
  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promotion_products (
  promotion_id  uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, product_id)
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_e164          text UNIQUE NOT NULL,
  name                text,
  email               text,
  delivery_addresses  jsonb NOT NULL DEFAULT '[]',
  language_pref       text NOT NULL DEFAULT 'en' CHECK (language_pref IN ('en', 'ar')),
  first_order_at      timestamptz,
  last_order_at       timestamptz,
  total_orders        int NOT NULL DEFAULT 0,
  lifetime_value      numeric(10,3) NOT NULL DEFAULT 0,
  preference_vector   jsonb NOT NULL DEFAULT '{}',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- DRIVERS
-- ============================================================

CREATE TABLE drivers (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              text NOT NULL,
  phone_e164        text NOT NULL,
  vehicle_type      text NOT NULL DEFAULT 'motorcycle',
  status            text NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('offline', 'available', 'busy', 'break')),
  current_location  jsonb,
  active_order_id   uuid,
  notes             text,
  is_active         boolean NOT NULL DEFAULT true,
  last_active_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE orders (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id           uuid REFERENCES customers(id) ON DELETE SET NULL,
  driver_id             uuid REFERENCES drivers(id) ON DELETE SET NULL,
  promotion_id          uuid REFERENCES promotions(id) ON DELETE SET NULL,

  -- Status with strict constraint
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','preparing','ready','dispatched','delivered','cancelled')),

  -- Delivery info
  delivery_address      jsonb NOT NULL,
  delivery_fee          numeric(10,3) NOT NULL DEFAULT 5.000,
  estimated_delivery_at timestamptz,

  -- Financials
  subtotal              numeric(10,3) NOT NULL,
  discount_amount       numeric(10,3) NOT NULL DEFAULT 0,
  total                 numeric(10,3) NOT NULL,

  -- Payment
  payment_method        text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'online')),
  payment_status        text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),

  -- Customer preferences
  special_instructions  text,
  language_pref         text NOT NULL DEFAULT 'en',
  promo_code_entered    text,

  -- Timestamps for each stage
  created_at            timestamptz NOT NULL DEFAULT now(),
  confirmed_at          timestamptz,
  preparing_at          timestamptz,
  ready_at              timestamptz,
  dispatched_at         timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text
);

CREATE TABLE order_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_snapshot jsonb NOT NULL, -- frozen copy at order time
  quantity        int NOT NULL CHECK (quantity > 0),
  unit_price      numeric(10,3) NOT NULL,
  total_price     numeric(10,3) NOT NULL,
  notes           text
);

CREATE TABLE order_item_modifiers (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id       uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_option_id  uuid NOT NULL REFERENCES modifier_options(id) ON DELETE RESTRICT,
  option_snapshot     jsonb NOT NULL, -- frozen copy
  price_delta         numeric(10,3) NOT NULL DEFAULT 0
);

-- ============================================================
-- EVENT LOG (IMMUTABLE)
-- ============================================================

CREATE TABLE order_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  from_status     text,
  to_status       text,
  actor_id        uuid,
  actor_role      text CHECK (actor_role IN ('customer', 'admin', 'manager', 'supervisor', 'system')),
  payload         jsonb NOT NULL DEFAULT '{}',
  idempotency_key text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent any modifications to event log
CREATE RULE no_update_order_events AS ON UPDATE TO order_events DO INSTEAD NOTHING;
CREATE RULE no_delete_order_events AS ON DELETE TO order_events DO INSTEAD NOTHING;

-- ============================================================
-- ANALYTICS EVENTS
-- ============================================================

CREATE TABLE analytics_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type      text NOT NULL,
  session_id      text,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  entity_id       uuid,
  entity_type     text,
  properties      jsonb NOT NULL DEFAULT '{}',
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  partition_date  date NOT NULL DEFAULT current_date
);

-- Index for partition-based querying
CREATE INDEX idx_analytics_partition ON analytics_events(partition_date, event_type);
CREATE INDEX idx_analytics_customer ON analytics_events(customer_id, occurred_at);
CREATE INDEX idx_analytics_entity ON analytics_events(entity_type, entity_id);

-- ============================================================
-- AI SUGGESTION CACHE
-- ============================================================

CREATE TABLE ai_suggestion_cache (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key         text UNIQUE NOT NULL,
  suggestion_payload jsonb NOT NULL,
  confidence_score  numeric(5,4) NOT NULL DEFAULT 0.5,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'
);

-- ============================================================
-- SYSTEM CONFIG
-- ============================================================

CREATE TABLE system_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE system_config_audit (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key  text NOT NULL,
  old_value   jsonb,
  new_value   jsonb NOT NULL,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- STAFF
-- ============================================================

CREATE TABLE staff (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  app_role    text NOT NULL CHECK (app_role IN ('admin', 'manager', 'supervisor')),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- NOTIFICATION TEMPLATES
-- ============================================================

CREATE TABLE notification_templates (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type  text UNIQUE NOT NULL,
  subject_en  text,
  body_en     text NOT NULL,
  subject_ar  text,
  body_ar     text NOT NULL,
  channel     text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'push', 'both')),
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- MATERIALIZED VIEWS (Analytics)
-- ============================================================

CREATE MATERIALIZED VIEW mv_hourly_revenue AS
SELECT
  date_trunc('hour', created_at) AS hour_bucket,
  COUNT(*) AS order_count,
  SUM(total) AS revenue,
  AVG(total) AS avg_order_value,
  SUM(discount_amount) AS total_discounts
FROM orders
WHERE status = 'delivered'
GROUP BY 1
ORDER BY 1 DESC;

CREATE UNIQUE INDEX ON mv_hourly_revenue(hour_bucket);

CREATE MATERIALIZED VIEW mv_product_popularity AS
SELECT
  p.id,
  p.name_en,
  p.category_id,
  COUNT(oi.id) AS order_count,
  SUM(oi.quantity) AS total_qty,
  SUM(oi.total_price) AS total_revenue,
  AVG(oi.unit_price) AS avg_price
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'delivered'
GROUP BY p.id, p.name_en, p.category_id;

CREATE UNIQUE INDEX ON mv_product_popularity(id);

CREATE MATERIALIZED VIEW mv_peak_demand AS
SELECT
  EXTRACT(DOW FROM created_at) AS day_of_week,
  EXTRACT(HOUR FROM created_at) AS hour_of_day,
  COUNT(*) AS order_count,
  AVG(total) AS avg_order_value
FROM orders
WHERE status != 'cancelled'
  AND created_at > now() - interval '90 days'
GROUP BY 1, 2;

CREATE MATERIALIZED VIEW mv_promo_performance AS
SELECT
  p.id,
  p.name_en,
  p.code,
  p.discount_type,
  p.usage_count,
  SUM(o.discount_amount) AS total_discount_given,
  SUM(o.total) AS total_revenue_with_promo,
  COUNT(o.id) AS orders_used,
  AVG(o.total) AS avg_order_value
FROM promotions p
LEFT JOIN orders o ON o.promotion_id = p.id AND o.status = 'delivered'
GROUP BY p.id, p.name_en, p.code, p.discount_type, p.usage_count;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_driver ON orders(driver_id, status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at DESC);
CREATE INDEX idx_products_category ON products(category_id, display_order);
CREATE INDEX idx_products_available ON products(is_available, is_featured);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_promotions_updated_at BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Notify realtime on order events
CREATE OR REPLACE FUNCTION notify_order_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'order_events',
    json_build_object(
      'order_id', NEW.order_id,
      'event_type', NEW.event_type,
      'from_status', NEW.from_status,
      'to_status', NEW.to_status,
      'actor_role', NEW.actor_role,
      'payload', NEW.payload,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_order_event
AFTER INSERT ON order_events
FOR EACH ROW EXECUTE FUNCTION notify_order_event();

-- Update order status timestamps automatically
CREATE OR REPLACE FUNCTION sync_order_timestamps()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmed'   AND OLD.status != 'confirmed'   THEN NEW.confirmed_at   = now(); END IF;
  IF NEW.status = 'preparing'   AND OLD.status != 'preparing'   THEN NEW.preparing_at   = now(); END IF;
  IF NEW.status = 'ready'       AND OLD.status != 'ready'       THEN NEW.ready_at       = now(); END IF;
  IF NEW.status = 'dispatched'  AND OLD.status != 'dispatched'  THEN NEW.dispatched_at  = now(); END IF;
  IF NEW.status = 'delivered'   AND OLD.status != 'delivered'   THEN NEW.delivered_at   = now(); END IF;
  IF NEW.status = 'cancelled'   AND OLD.status != 'cancelled'   THEN NEW.cancelled_at   = now(); END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_order_timestamps
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION sync_order_timestamps();

-- System config audit
CREATE OR REPLACE FUNCTION audit_system_config()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO system_config_audit(config_key, old_value, new_value, changed_by)
  VALUES (NEW.key, OLD.value, NEW.value, NEW.updated_by);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_system_config_audit
AFTER UPDATE ON system_config
FOR EACH ROW EXECUTE FUNCTION audit_system_config();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestion_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Public read for catalog
CREATE POLICY "catalog_public_read" ON categories FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "products_public_read" ON products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "modifier_groups_public_read" ON modifier_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "modifier_options_public_read" ON modifier_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_modifier_groups_public_read" ON product_modifier_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "combo_rules_public_read" ON combo_rules FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "promotions_public_read" ON promotions FOR SELECT TO anon, authenticated USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));
CREATE POLICY "ai_cache_public_read" ON ai_suggestion_cache FOR SELECT TO anon, authenticated USING (expires_at > now());

-- Customer orders: own orders only
CREATE POLICY "orders_own_read" ON orders FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY "order_items_own_read" ON order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()));
CREATE POLICY "order_events_own_read" ON order_events FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE customer_id = auth.uid()));

-- Customers: own profile only
CREATE POLICY "customers_own_read" ON customers FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "customers_own_update" ON customers FOR UPDATE TO authenticated USING (id = auth.uid());

-- Drivers: no client access (service_role only)
CREATE POLICY "drivers_no_client_access" ON drivers FOR ALL TO anon, authenticated USING (false);

-- Staff: no client access
CREATE POLICY "staff_no_client_access" ON staff FOR ALL TO anon, authenticated USING (false);

-- System config: no client access
CREATE POLICY "system_config_no_client_access" ON system_config FOR ALL TO anon, authenticated USING (false);

-- Analytics: insert only via service_role (clients blocked)
CREATE POLICY "analytics_no_client_write" ON analytics_events FOR ALL TO anon, authenticated USING (false);

-- ============================================================
-- DEFAULT SYSTEM CONFIG
-- ============================================================

INSERT INTO system_config (key, value, description) VALUES
('delivery_fee', '5.000', 'Fixed delivery fee in QAR'),
('delivery_zones', '{"default": {"fee": 5.0, "min_delivery_time": 30, "max_delivery_time": 60}}', 'Delivery zone configuration'),
('ai_scoring_weights', '{"popularity": 0.35, "revenue": 0.25, "affinity": 0.20, "promo_conversion": 0.15, "recency": 0.05}', 'AI recommendation scoring weights'),
('order_sla_minutes', '45', 'Target delivery SLA in minutes'),
('max_active_orders', '50', 'Maximum concurrent active orders'),
('otp_expiry_seconds', '300', 'OTP expiry in seconds'),
('suggestion_cache_ttl_minutes', '15', 'AI suggestion cache TTL'),
('restaurant_name_en', '"Restaurant"', 'Restaurant name in English'),
('restaurant_name_ar', '"Ø§Ù„Ù…Ø·Ø¹Ù…"', 'Restaurant name in Arabic'),
('restaurant_phone', '"+97412345678"', 'Restaurant contact number'),
('operating_hours', '{"open": "10:00", "close": "23:00", "timezone": "Asia/Qatar"}', 'Operating hours'),
('guest_checkout_enabled', 'true', 'Allow guest (unauthenticated) checkout'),
('notification_provider', '"twilio"', 'SMS notification provider');

-- ============================================================
-- NOTIFICATION TEMPLATES (Bilingual)
-- ============================================================

INSERT INTO notification_templates (event_type, body_en, body_ar) VALUES
('order.created',
 'Your order #{{order_number}} has been received. We''ll confirm it shortly. Thank you for choosing us.',
 'ØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø·Ù„Ø¨Ùƒ Ø±Ù‚Ù… #{{order_number}}. Ø³Ù†Ù‚ÙˆÙ… Ø¨ØªØ£ÙƒÙŠØ¯Ù‡ Ù‚Ø±ÙŠØ¨Ø§Ù‹. Ø´ÙƒØ±Ø§Ù‹ Ù„Ø§Ø®ØªÙŠØ§Ø±Ùƒ Ù„Ù†Ø§.'),
('order.confirmed',
 'Great news! Order #{{order_number}} is confirmed and our kitchen is preparing your meal. Estimated delivery: {{eta}} minutes.',
 'Ø£Ø®Ø¨Ø§Ø± Ø±Ø§Ø¦Ø¹Ø©! ØªÙ… ØªØ£ÙƒÙŠØ¯ Ø·Ù„Ø¨Ùƒ Ø±Ù‚Ù… #{{order_number}} ÙˆÙ…Ø·Ø¨Ø®Ù†Ø§ ÙŠØ­Ø¶Ø± ÙˆØ¬Ø¨ØªÙƒ. ÙˆÙ‚Øª Ø§Ù„ØªÙˆØµÙŠÙ„ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹: {{eta}} Ø¯Ù‚ÙŠÙ‚Ø©.'),
('order.ready',
 'Your order #{{order_number}} is ready and a driver will be assigned shortly.',
 'Ø·Ù„Ø¨Ùƒ Ø±Ù‚Ù… #{{order_number}} Ø¬Ø§Ù‡Ø² ÙˆØ³ÙŠØªÙ… ØªØ¹ÙŠÙŠÙ† Ø³Ø§Ø¦Ù‚ Ù‚Ø±ÙŠØ¨Ø§Ù‹.'),
('order.dispatched',
 'Your order is on the way! Driver {{driver_name}} is heading to you. Estimated arrival: {{eta}} minutes.',
 'Ø·Ù„Ø¨Ùƒ ÙÙŠ Ø§Ù„Ø·Ø±ÙŠÙ‚! Ø§Ù„Ø³Ø§Ø¦Ù‚ {{driver_name}} ÙÙŠ Ø·Ø±ÙŠÙ‚Ù‡ Ø¥Ù„ÙŠÙƒ. ÙˆÙ‚Øª Ø§Ù„ÙˆØµÙˆÙ„ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹: {{eta}} Ø¯Ù‚ÙŠÙ‚Ø©.'),
('order.delivered',
 'Your order #{{order_number}} has been delivered. Enjoy your meal! We hope to see you again soon.',
 'ØªÙ… ØªÙˆØµÙŠÙ„ Ø·Ù„Ø¨Ùƒ Ø±Ù‚Ù… #{{order_number}}. Ø§Ø³ØªÙ…ØªØ¹ Ø¨ÙˆØ¬Ø¨ØªÙƒ! Ù†Ø£Ù…Ù„ Ø£Ù† Ù†Ø±Ø§Ùƒ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ù‚Ø±ÙŠØ¨Ø§Ù‹.'),
('order.cancelled',
 'Your order #{{order_number}} has been cancelled. Reason: {{reason}}. We apologize for any inconvenience.',
 'ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø·Ù„Ø¨Ùƒ Ø±Ù‚Ù… #{{order_number}}. Ø§Ù„Ø³Ø¨Ø¨: {{reason}}. Ù†Ø¹ØªØ°Ø± Ø¹Ù† Ø£ÙŠ Ø¥Ø²Ø¹Ø§Ø¬.');

-- ============================================================
-- pg_cron JOBS
-- ============================================================

-- Refresh materialized views every 30 minutes
SELECT cron.schedule('refresh-mv-revenue', '*/30 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_revenue');
SELECT cron.schedule('refresh-mv-popularity', '0 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_popularity');
SELECT cron.schedule('refresh-mv-demand', '0 3 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_peak_demand');
SELECT cron.schedule('refresh-mv-promos', '*/15 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_promo_performance');

-- END MIGRATION: 001_initial_schema.sql


-- ============================================================
-- BEGIN MIGRATION: 003_functions.sql
-- ============================================================

-- ============================================================
-- RMS Platform - Database Functions & Stored Procedures
-- ============================================================

-- â”€â”€ Safe order status transition (callable from edge functions) â”€â”€
CREATE OR REPLACE FUNCTION advance_order_status(
  p_order_id    uuid,
  p_to_status   text,
  p_actor_id    uuid,
  p_actor_role  text,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       orders%ROWTYPE;
  v_idempotency text;
  v_event_type  text;
BEGIN
  -- Lock the order row to prevent race conditions
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Validate transition using the same matrix as the edge function
  IF NOT (
    (v_order.status = 'pending'    AND p_to_status IN ('confirmed', 'cancelled')) OR
    (v_order.status = 'confirmed'  AND p_to_status IN ('preparing', 'cancelled')) OR
    (v_order.status = 'preparing'  AND p_to_status = 'ready') OR
    (v_order.status = 'ready'      AND p_to_status = 'dispatched') OR
    (v_order.status = 'dispatched' AND p_to_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % â†’ %', v_order.status, p_to_status;
  END IF;

  -- Update the order
  UPDATE orders
  SET
    status              = p_to_status,
    cancellation_reason = CASE WHEN p_to_status = 'cancelled' THEN p_reason ELSE cancellation_reason END
  WHERE id = p_order_id;

  -- Map status to event type
  v_event_type := CASE p_to_status
    WHEN 'confirmed'  THEN 'order.confirmed'
    WHEN 'preparing'  THEN 'order.preparation_started'
    WHEN 'ready'      THEN 'order.ready'
    WHEN 'dispatched' THEN 'order.dispatched'
    WHEN 'delivered'  THEN 'order.delivered'
    WHEN 'cancelled'  THEN 'order.cancelled'
  END;

  -- Build idempotency key
  v_idempotency := p_order_id::text || '::' || v_event_type || '::' || p_actor_id::text || '::' || EXTRACT(EPOCH FROM date_trunc('minute', now()))::bigint::text;

  -- Insert event (ignore duplicate idempotency keys)
  INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_id, actor_role, payload, idempotency_key)
  VALUES (
    p_order_id, v_event_type, v_order.status, p_to_status, p_actor_id, p_actor_role,
    jsonb_build_object('reason', p_reason),
    v_idempotency
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'from_status', v_order.status,
    'to_status', p_to_status
  );
END;
$$;

-- â”€â”€ Get live order stats (used by dashboard KPIs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION get_live_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'active_orders',      COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled')),
    'pending_orders',     COUNT(*) FILTER (WHERE status = 'pending'),
    'today_orders',       COUNT(*) FILTER (WHERE created_at::date = current_date),
    'today_revenue',      COALESCE(SUM(total) FILTER (WHERE status = 'delivered' AND created_at::date = current_date), 0),
    'today_delivered',    COUNT(*) FILTER (WHERE status = 'delivered' AND created_at::date = current_date),
    'avg_delivery_min',   COALESCE(
                            ROUND(AVG(
                              EXTRACT(EPOCH FROM (delivered_at - confirmed_at)) / 60
                            ) FILTER (WHERE status = 'delivered' AND created_at::date = current_date))
                          , 0)
  )
  FROM orders;
$$;

-- â”€â”€ Get order funnel data for analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION get_order_funnel(p_days int DEFAULT 7)
RETURNS TABLE (
  stage       text,
  count       bigint,
  pct_of_prev numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH events AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'session.started')     AS sessions,
      COUNT(*) FILTER (WHERE event_type = 'cart.item_added')     AS cart_adds,
      COUNT(*) FILTER (WHERE event_type = 'checkout.started')    AS checkouts,
      COUNT(*) FILTER (WHERE event_type = 'checkout.otp_verified') AS otp_verified,
      COUNT(*) FILTER (WHERE event_type = 'payment.succeeded')   AS conversions
    FROM analytics_events
    WHERE occurred_at > now() - (p_days || ' days')::interval
  )
  SELECT 'Sessions'::text,        sessions,       100::numeric           FROM events UNION ALL
  SELECT 'Cart Adds'::text,       cart_adds,      ROUND(cart_adds::numeric  / NULLIF(sessions, 0) * 100, 1) FROM events UNION ALL
  SELECT 'Checkout'::text,        checkouts,      ROUND(checkouts::numeric  / NULLIF(cart_adds, 0) * 100, 1) FROM events UNION ALL
  SELECT 'OTP Verified'::text,    otp_verified,   ROUND(otp_verified::numeric / NULLIF(checkouts, 0) * 100, 1) FROM events UNION ALL
  SELECT 'Orders Placed'::text,   conversions,    ROUND(conversions::numeric / NULLIF(otp_verified, 0) * 100, 1) FROM events;
$$;

-- â”€â”€ RFM segmentation query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION get_customer_segments()
RETURNS TABLE (
  segment       text,
  customer_count bigint,
  avg_ltv       numeric,
  avg_orders    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH scored AS (
    SELECT
      id,
      lifetime_value,
      total_orders,
      last_order_at,
      CASE
        WHEN total_orders >= 10 AND last_order_at > now() - interval '30 days' AND lifetime_value > 1000 THEN 'Champions'
        WHEN total_orders >= 5  AND last_order_at > now() - interval '60 days'                          THEN 'Loyal'
        WHEN total_orders >= 2  AND last_order_at > now() - interval '30 days'                          THEN 'Potential Loyal'
        WHEN total_orders = 1   AND last_order_at > now() - interval '30 days'                          THEN 'New Customer'
        WHEN last_order_at < now() - interval '90 days'                                                 THEN 'At Risk'
        ELSE 'Regular'
      END AS segment
    FROM customers
    WHERE total_orders > 0
  )
  SELECT
    segment,
    COUNT(*)                        AS customer_count,
    ROUND(AVG(lifetime_value), 2)   AS avg_ltv,
    ROUND(AVG(total_orders), 1)     AS avg_orders
  FROM scored
  GROUP BY segment
  ORDER BY avg_ltv DESC;
$$;

-- â”€â”€ Refresh all materialized views (called by cron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION refresh_all_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_promo_performance;
  -- mv_peak_demand is refreshed separately (less frequent, more expensive)
END;
$$;

-- â”€â”€ Schedule the combined refresh every 30 minutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT cron.schedule('refresh-all-mv', '*/30 * * * *', 'SELECT refresh_all_mv()');

-- â”€â”€ Auto-trigger customer profile update on delivery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- This uses a Postgres trigger to call the edge function via pg_net
-- Requires pg_net extension (available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_customer_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire on transition to 'delivered'
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.customer_id IS NOT NULL THEN
    PERFORM net.http_post(
      url    := current_setting('app.supabase_url', true) || '/functions/v1/update-customer-profile',
      body   := jsonb_build_object('order_id', NEW.id)::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_profile_on_delivery
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (NEW.status = 'delivered' AND OLD.status != 'delivered')
EXECUTE FUNCTION trigger_customer_profile_update();

-- END MIGRATION: 003_functions.sql


-- ============================================================
-- BEGIN MIGRATION: 0040_customer_reviews.sql
-- ============================================================

-- ============================================================
-- Customer Reviews System
-- ============================================================

-- Reviews table for customer feedback
CREATE TABLE IF NOT EXISTS customer_reviews (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  rating          integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title           text,
  comment         text,
  photos          jsonb DEFAULT '[]',
  is_verified     boolean NOT NULL DEFAULT false,
  is_featured     boolean NOT NULL DEFAULT false,
  helpful_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Review helpful votes
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id       uuid NOT NULL REFERENCES customer_reviews(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id, customer_id)
);

-- Review responses from restaurant
CREATE TABLE IF NOT EXISTS review_responses (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id       uuid NOT NULL REFERENCES customer_reviews(id) ON DELETE CASCADE,
  staff_id        uuid REFERENCES staff(id) ON DELETE SET NULL,
  response        text NOT NULL,
  is_public       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_customer_reviews_product_id ON customer_reviews(product_id);
CREATE INDEX idx_customer_reviews_customer_id ON customer_reviews(customer_id);
CREATE INDEX idx_customer_reviews_order_id ON customer_reviews(order_id);
CREATE INDEX idx_customer_reviews_rating ON customer_reviews(rating);
CREATE INDEX idx_customer_reviews_created_at ON customer_reviews(created_at DESC);
CREATE INDEX idx_customer_reviews_is_featured ON customer_reviews(is_featured) WHERE is_featured = true;

-- Update product average rating trigger
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products 
  SET 
    average_rating = (
      SELECT COALESCE(AVG(rating), 0) 
      FROM customer_reviews 
      WHERE product_id = NEW.product_id AND is_verified = true
    ),
    review_count = (
      SELECT COUNT(*) 
      FROM customer_reviews 
      WHERE product_id = NEW.product_id AND is_verified = true
    )
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for rating updates
DROP TRIGGER IF EXISTS trigger_update_product_rating ON customer_reviews;
CREATE TRIGGER trigger_update_product_rating
  AFTER INSERT OR UPDATE OR DELETE ON customer_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_product_rating();

-- RLS Policies
ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;

-- Customers can view all verified reviews
CREATE POLICY "Customers can view verified reviews" ON customer_reviews
  FOR SELECT USING (
    is_verified = true OR 
    auth.uid() = customer_id
  );

-- Customers can insert reviews for products they've ordered
CREATE POLICY "Customers can insert reviews" ON customer_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = customer_id AND
    EXISTS (
      SELECT 1 FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.customer_id = auth.uid() 
      AND oi.product_id = product_id
      AND o.status = 'delivered'
    )
  );

-- Customers can update their own reviews
CREATE POLICY "Customers can update own reviews" ON customer_reviews
  FOR UPDATE USING (auth.uid() = customer_id);

-- Customers can delete their own reviews
CREATE POLICY "Customers can delete own reviews" ON customer_reviews
  FOR DELETE USING (auth.uid() = customer_id);

-- Helpful votes policies
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can vote on reviews" ON review_helpful_votes
  FOR ALL WITH CHECK (auth.uid() = customer_id);

-- Review responses policies
ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

-- Staff can manage review responses
CREATE POLICY "Staff can manage review responses" ON review_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Add columns to products table if they don't exist
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0;

-- END MIGRATION: 0040_customer_reviews.sql


-- ============================================================
-- BEGIN MIGRATION: 0041_promotion_enhancements.sql
-- ============================================================

-- ============================================================
-- Promotion Enhancements Migration
-- ============================================================

-- Add promotion_categories table
CREATE TABLE promotion_categories (
  promotion_id  uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, category_id)
);

-- Add is_featured and condition_type to promotions
ALTER TABLE promotions
  ADD COLUMN is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN condition_type text NOT NULL DEFAULT 'none'
  CHECK (condition_type IN ('none', 'first_order', 'min_order', 'specific_products', 'specific_categories'));

-- Update conditions JSONB structure to support new condition types
-- The conditions field will store:
-- - For 'first_order': {}
-- - For 'min_order': { "min_value": number }
-- - For 'specific_products': { "product_ids": uuid[] }
-- - For 'specific_categories': { "category_ids": uuid[] }

-- Enable RLS
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;

-- Policies for promotion_categories
CREATE POLICY "promotion_categories_service_all" ON promotion_categories
  FOR ALL TO service_role USING (true);

CREATE POLICY "promotion_categories_no_client_access" ON promotion_categories
  FOR ALL TO anon, authenticated USING (false);

-- Index for faster queries
CREATE INDEX idx_promotions_featured ON promotions(is_featured, is_active) 
  WHERE is_active = true AND is_featured = true;

CREATE INDEX idx_promotions_condition_type ON promotions(condition_type, is_active)
  WHERE is_active = true;

CREATE INDEX idx_promotion_categories_category ON promotion_categories(category_id);

-- END MIGRATION: 0041_promotion_enhancements.sql


-- ============================================================
-- BEGIN MIGRATION: 0050_inventory_tracking.sql
-- ============================================================

-- ============================================================
-- Inventory Tracking System
-- ============================================================

-- Add inventory columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS stock_unit text DEFAULT 'pieces',
ADD COLUMN IF NOT EXISTS last_stock_update timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_stock_tracked boolean NOT NULL DEFAULT false;

-- Inventory transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'adjustment', 'waste', 'return')),
  quantity_change integer NOT NULL, -- positive for additions, negative for subtractions
  quantity_before integer NOT NULL,
  quantity_after  integer NOT NULL,
  reason          text,
  staff_id        uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  notes           text
);

-- Low stock alerts table
CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock   integer NOT NULL,
  threshold       integer NOT NULL,
  is_resolved     boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Inventory snapshots for historical tracking
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_level     integer NOT NULL,
  snapshot_date   date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, snapshot_date)
);

-- Indexes for performance
CREATE INDEX idx_inventory_transactions_product_id ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_created_at ON inventory_transactions(created_at DESC);
CREATE INDEX idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_low_stock_alerts_product_id ON low_stock_alerts(product_id);
CREATE INDEX idx_low_stock_alerts_resolved ON low_stock_alerts(is_resolved);
CREATE INDEX idx_inventory_snapshots_product_id ON inventory_snapshots(product_id);
CREATE INDEX idx_inventory_snapshots_date ON inventory_snapshots(snapshot_date DESC);

-- Function to create daily inventory snapshots
CREATE OR REPLACE FUNCTION create_daily_inventory_snapshots()
RETURNS void AS $$
BEGIN
  INSERT INTO inventory_snapshots (product_id, stock_level, snapshot_date)
  SELECT 
    id, 
    stock_level, 
    CURRENT_DATE
  FROM products 
  WHERE is_stock_tracked = true
  ON CONFLICT (product_id, snapshot_date) 
  DO UPDATE SET 
    stock_level = EXCLUDED.stock_level,
    created_at = now();
END;
$$ LANGUAGE plpgsql;

-- Schedule daily snapshot creation
SELECT cron.schedule('daily-inventory-snapshots', '0 1 * * *', 'SELECT create_daily_inventory_snapshots()');

-- Function to update stock and create transaction
CREATE OR REPLACE FUNCTION update_product_stock(
  p_product_id uuid,
  p_quantity_change integer,
  p_transaction_type text,
  p_reason text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_current_stock integer;
  v_new_stock integer;
BEGIN
  -- Get current stock
  SELECT stock_level INTO v_current_stock
  FROM products
  WHERE id = p_product_id AND is_stock_tracked = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or stock tracking not enabled';
  END IF;
  
  -- Calculate new stock
  v_new_stock := v_current_stock + p_quantity_change;
  
  -- Validate stock doesn't go negative (except for adjustments)
  IF v_new_stock < 0 AND p_transaction_type != 'adjustment' THEN
    RAISE EXCEPTION 'Insufficient stock for this transaction';
  END IF;
  
  -- Update product stock
  UPDATE products
  SET 
    stock_level = v_new_stock,
    last_stock_update = now()
  WHERE id = p_product_id;
  
  -- Create transaction record
  INSERT INTO inventory_transactions (
    product_id,
    transaction_type,
    quantity_change,
    quantity_before,
    quantity_after,
    reason,
    staff_id,
    notes
  ) VALUES (
    p_product_id,
    p_transaction_type,
    p_quantity_change,
    v_current_stock,
    v_new_stock,
    p_reason,
    p_staff_id,
    p_notes
  );
  
  -- Check for low stock alert
  IF v_new_stock <= (SELECT low_stock_threshold FROM products WHERE id = p_product_id) THEN
    INSERT INTO low_stock_alerts (product_id, current_stock, threshold)
    VALUES (
      p_product_id,
      v_new_stock,
      (SELECT low_stock_threshold FROM products WHERE id = p_product_id)
    )
    ON CONFLICT (product_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check and create low stock alerts
CREATE OR REPLACE FUNCTION check_low_stock_alerts()
RETURNS void AS $$
BEGIN
  INSERT INTO low_stock_alerts (product_id, current_stock, threshold)
  SELECT 
    id,
    stock_level,
    low_stock_threshold
  FROM products
  WHERE 
    is_stock_tracked = true 
    AND stock_level <= low_stock_threshold
    AND id NOT IN (
      SELECT product_id FROM low_stock_alerts WHERE is_resolved = false
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule low stock check every hour
SELECT cron.schedule('hourly-low-stock-check', '0 * * * *', 'SELECT check_low_stock_alerts()');

-- RLS Policies
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- Staff can manage inventory
CREATE POLICY "Staff can manage inventory transactions" ON inventory_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Staff can view and manage low stock alerts
CREATE POLICY "Staff can manage low stock alerts" ON low_stock_alerts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Staff can view inventory snapshots
CREATE POLICY "Staff can view inventory snapshots" ON inventory_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('supervisor', 'manager', 'admin')
    )
  );

-- Update products table RLS to allow staff to update stock
CREATE POLICY "Staff can update product inventory" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- END MIGRATION: 0050_inventory_tracking.sql


-- ============================================================
-- BEGIN MIGRATION: 0051_promotion_time_fields.sql
-- ============================================================

-- ============================================================
-- Add Time Range Fields to Promotions
-- ============================================================

-- Add time fields to promotions for daily time-based promotions
ALTER TABLE promotions
  ADD COLUMN valid_from_time time,
  ADD COLUMN valid_until_time time;

-- Update existing promotions to have default time values
UPDATE promotions 
SET valid_from_time = '00:00:00', 
    valid_until_time = '23:59:59'
WHERE valid_from_time IS NULL;

-- Add index for time-based queries
CREATE INDEX idx_promotions_time_range ON promotions(is_active, valid_from, valid_until, valid_from_time, valid_until_time)
WHERE is_active = true;

-- END MIGRATION: 0051_promotion_time_fields.sql


-- ============================================================
-- BEGIN MIGRATION: 0060_customer_analytics.sql
-- ============================================================

-- ============================================================
-- Customer Analytics Functions
-- ============================================================

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS get_customer_metrics(p_days integer);
DROP FUNCTION IF EXISTS get_customer_segments();
DROP FUNCTION IF EXISTS get_cohort_analysis();
DROP FUNCTION IF EXISTS get_customer_lifetime_value();

-- Function to get customer metrics
CREATE FUNCTION get_customer_metrics(p_days integer DEFAULT 30)
RETURNS TABLE (
  total_customers bigint,
  new_customers_this_month bigint,
  repeat_customers bigint,
  average_orders_per_customer numeric,
  customer_retention_rate numeric,
  top_customers jsonb
) AS $$
DECLARE
  v_start_date timestamptz;
  v_month_start timestamptz;
BEGIN
  v_start_date := now() - (p_days || ' days')::interval;
  v_month_start := date_trunc('month', now());

  RETURN QUERY
  WITH customer_stats AS (
    SELECT 
      COUNT(DISTINCT o.customer_id) as total_customers,
      COUNT(DISTINCT CASE WHEN o.created_at >= v_month_start THEN o.customer_id END) as new_customers_this_month,
      COUNT(DISTINCT CASE WHEN 
        o.created_at < v_month_start 
        AND EXISTS (
          SELECT 1 FROM orders o2 
          WHERE o2.customer_id = o.customer_id 
          AND o2.created_at >= v_month_start
        )
      THEN o.customer_id END) as repeat_customers,
      AVG(CASE WHEN o.created_at >= v_start_date THEN 1.0 END) as avg_orders_per_customer
    FROM orders o
    WHERE o.status = 'delivered'
    AND o.created_at >= v_start_date
  ),
  top_customers_data AS (
    SELECT 
      o.customer_id,
      u.email as name,
      u.phone as phone,
      COUNT(*) as total_orders,
      SUM(o.total) as total_spent,
      AVG(o.total) as average_order_value,
      MAX(o.created_at) as last_order_date
    FROM orders o
    LEFT JOIN auth.users u ON o.customer_id = u.id
    WHERE o.status = 'delivered'
    AND o.created_at >= v_start_date
    GROUP BY o.customer_id, u.email, u.phone
    ORDER BY total_spent DESC
    LIMIT 10
  ),
  retention_calc AS (
    SELECT 
      CASE 
        WHEN (SELECT COUNT(*) FROM orders WHERE status = 'delivered') = 0 THEN 0
        ELSE (
          SELECT COUNT(DISTINCT customer_id) 
          FROM orders 
          WHERE status = 'delivered' 
          AND created_at >= v_start_date
        )::numeric / 
        NULLIF(
          (SELECT COUNT(DISTINCT customer_id) FROM orders WHERE status = 'delivered'), 0
        )
      END as retention_rate
  )
  SELECT 
    cs.total_customers,
    cs.new_customers_this_month,
    cs.repeat_customers,
    COALESCE(cs.avg_orders_per_customer, 0) as average_orders_per_customer,
    COALESCE(rc.retention_rate, 0) as customer_retention_rate,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'customer_id', customer_id,
          'name', name,
          'phone', phone,
          'total_orders', total_orders,
          'total_spent', total_spent,
          'average_order_value', average_order_value,
          'last_order_date', last_order_date
        ) ORDER BY total_spent DESC
      ), '[]'::jsonb
    ) as top_customers
  FROM customer_stats cs, retention_calc rc;
END;
$$ LANGUAGE plpgsql;

-- Function to get customer segments
CREATE FUNCTION get_customer_segments()
RETURNS TABLE (
  segment text,
  count bigint,
  percentage numeric,
  characteristics text[]
) AS $$
BEGIN
  RETURN QUERY
  WITH customer_segments AS (
    SELECT 
      CASE 
        WHEN total_orders >= 10 AND total_spent >= 500 THEN 'VIP Customers'
        WHEN total_orders >= 5 AND total_spent >= 200 THEN 'Loyal Customers'
        WHEN total_orders >= 3 THEN 'Regular Customers'
        WHEN total_orders = 1 THEN 'New Customers'
        ELSE 'Inactive Customers'
      END as segment,
      COUNT(*) as count
    FROM (
      SELECT 
        o.customer_id,
        COUNT(*) as total_orders,
        SUM(o.total) as total_spent
      FROM orders o
      WHERE o.status = 'delivered'
      AND o.created_at >= now() - interval '90 days'
      GROUP BY o.customer_id
    ) customer_data
    GROUP BY segment
  ),
  total_customers AS (
    SELECT COUNT(*) as total FROM customer_segments
  )
  SELECT 
    cs.segment,
    cs.count,
    (cs.count::numeric / NULLIF(tc.total, 0)) * 100 as percentage,
    CASE 
      WHEN cs.segment = 'VIP Customers' THEN ARRAY['High value', 'Frequent orders', 'Premium service']
      WHEN cs.segment = 'Loyal Customers' THEN ARRAY['Repeat business', 'Good spending', 'Regular visits']
      WHEN cs.segment = 'Regular Customers' THEN ARRAY['Multiple orders', 'Growing relationship']
      WHEN cs.segment = 'New Customers' THEN ARRAY['First time', 'Potential growth']
      WHEN cs.segment = 'Inactive Customers' THEN ARRAY['No recent orders', 'Re-engagement needed']
      ELSE ARRAY['Uncategorized']
    END as characteristics
  FROM customer_segments cs, total_customers tc
  ORDER BY cs.count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get cohort analysis
CREATE FUNCTION get_cohort_analysis()
RETURNS TABLE (
  cohort text,
  customers bigint,
  retention_rates jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH customer_cohorts AS (
    SELECT 
      customer_id,
      date_trunc('month', MIN(created_at)) as cohort_month
    FROM orders
    WHERE status = 'delivered'
    GROUP BY customer_id
  ),
  cohort_data AS (
    SELECT 
      to_char(cc.cohort_month, 'YYYY-MM') as cohort,
      COUNT(*) as customers
    FROM customer_cohorts cc
    GROUP BY cc.cohort_month
    ORDER BY cc.cohort_month DESC
    LIMIT 12
  ),
  retention_rates AS (
    SELECT 
      to_char(cc.cohort_month, 'YYYY-MM') as cohort,
      jsonb_agg(
        jsonb_build_object(
          'month', EXTRACT(MONTH FROM AGE(o.created_at, cc.cohort_month)) + 1,
          'rate', CASE 
            WHEN o.created_at >= cc.cohort_month THEN 1.0 
            ELSE 0.0 
          END
        ) ORDER BY EXTRACT(MONTH FROM AGE(o.created_at, cc.cohort_month)) + 1
      ) as retention_rates
    FROM customer_cohorts cc
    LEFT JOIN orders o ON cc.customer_id = o.customer_id 
      AND o.status = 'delivered'
      AND o.created_at >= cc.cohort_month
      AND o.created_at <= cc.cohort_month + interval '12 months'
    GROUP BY cc.cohort_month
  )
  SELECT 
    cd.cohort,
    cd.customers,
    COALESCE(rr.retention_rates, '[]'::jsonb) as retention_rates
  FROM cohort_data cd
  LEFT JOIN retention_rates rr ON cd.cohort = rr.cohort
  ORDER BY cd.cohort DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get customer lifetime value
CREATE FUNCTION get_customer_lifetime_value()
RETURNS TABLE (
  total_customers bigint,
  average_ltv numeric,
  total_revenue numeric,
  monthly_ltv jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH customer_ltv AS (
    SELECT 
      o.customer_id,
      SUM(o.total) as lifetime_value
    FROM orders o
    WHERE o.status = 'delivered'
    GROUP BY o.customer_id
  ),
  ltv_stats AS (
    SELECT 
      COUNT(*) as total_customers,
      AVG(lifetime_value) as average_ltv,
      SUM(lifetime_value) as total_revenue
    FROM customer_ltv
  ),
  monthly_ltv_data AS (
    SELECT 
      to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
      COUNT(DISTINCT o.customer_id) as new_customers,
      AVG(customer_ltv.lifetime_value) as avg_ltv
    FROM orders o
    LEFT JOIN customer_ltv ON o.customer_id = customer_ltv.customer_id
    WHERE o.status = 'delivered'
    AND o.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', o.created_at)
  )
  SELECT 
    ls.total_customers,
    COALESCE(ls.average_ltv, 0) as average_ltv,
    COALESCE(ls.total_revenue, 0) as total_revenue,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'month', month,
          'new_customers', new_customers,
          'avg_ltv', COALESCE(avg_ltv, 0)
        ) ORDER BY month
      ), '[]'::jsonb
    ) as monthly_ltv
  FROM ltv_stats ls, monthly_ltv_data mld
  ORDER BY month;
END;
$$ LANGUAGE plpgsql;

-- Create customer_analytics view to avoid conflict with existing customers table
CREATE OR REPLACE VIEW customer_analytics AS
SELECT 
  o.customer_id as id,
  MAX(u.email) as name,
  MAX(u.phone) as phone,
  MIN(o.created_at) as first_order_date,
  MAX(o.created_at) as last_order_date,
  COUNT(*) as total_orders,
  SUM(o.total) as total_spent,
  AVG(o.total) as average_order_value
FROM orders o
LEFT JOIN auth.users u ON o.customer_id = u.id
WHERE o.status = 'delivered'
GROUP BY o.customer_id;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_customer_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_segments TO authenticated;
GRANT EXECUTE ON FUNCTION get_cohort_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_lifetime_value TO authenticated;
GRANT SELECT ON customer_analytics TO authenticated;

-- END MIGRATION: 0060_customer_analytics.sql


-- ============================================================
-- BEGIN MIGRATION: 0061_free_delivery_config.sql
-- ============================================================

-- ============================================================
-- Add Free Delivery Configuration
-- ============================================================

-- Add free delivery toggle to system config
INSERT INTO system_config (key, value, description) VALUES 
('free_delivery_enabled', 'false', 'Enable free delivery for all orders'),
('free_delivery_min_order', '0.000', 'Minimum order value for free delivery');

-- Update existing delivery_fee to be more descriptive
UPDATE system_config 
SET description = 'Standard delivery fee when not free'
WHERE key = 'delivery_fee';

-- END MIGRATION: 0061_free_delivery_config.sql


-- ============================================================
-- BEGIN MIGRATION: 0070_referral_program.sql
-- ============================================================

-- ============================================================
-- Customer Referral Program
-- ============================================================

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  max_uses        integer DEFAULT 50,
  current_uses    integer NOT NULL DEFAULT 0
);

-- Referral transactions table
CREATE TABLE IF NOT EXISTS referral_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_code_id uuid NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referrer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  reward_amount   numeric(10,2) NOT NULL DEFAULT 5.00,
  reward_type     text NOT NULL DEFAULT 'credit' CHECK (reward_type IN ('credit', 'discount', 'free_item')),
  is_claimed      boolean NOT NULL DEFAULT false,
  claimed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Referral rewards table
CREATE TABLE IF NOT EXISTS referral_rewards (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id  uuid NOT NULL REFERENCES referral_transactions(id) ON DELETE CASCADE,
  reward_amount   numeric(10,2) NOT NULL,
  reward_type     text NOT NULL,
  is_applied      boolean NOT NULL DEFAULT false,
  applied_at      timestamptz,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Add referral columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS referral_code text,
ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS referral_credits numeric(10,2) DEFAULT 0.00;

-- Indexes for performance
CREATE INDEX idx_referral_codes_customer_id ON referral_codes(customer_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_active ON referral_codes(is_active) WHERE is_active = true;
CREATE INDEX idx_referral_transactions_referrer ON referral_transactions(referrer_id);
CREATE INDEX idx_referral_transactions_referred ON referral_transactions(referred_id);
CREATE INDEX idx_referral_transactions_code ON referral_transactions(referral_code_id);
CREATE INDEX idx_referral_rewards_customer ON referral_rewards(customer_id);
CREATE INDEX idx_referral_rewards_applied ON referral_rewards(is_applied) WHERE is_applied = false;

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS generate_referral_code();
DROP FUNCTION IF EXISTS create_customer_referral_code(p_customer_id uuid);
DROP FUNCTION IF EXISTS process_referral(p_referral_code text, p_referred_id uuid, p_order_id uuid);
DROP FUNCTION IF EXISTS apply_referral_credits(p_customer_id uuid, p_order_id uuid, p_amount_to_apply numeric);
DROP FUNCTION IF EXISTS get_referral_stats(p_customer_id uuid);

-- Function to generate unique referral code
CREATE FUNCTION generate_referral_code()
RETURNS text AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := upper(substring(md5(random()::text), 1, 8));
    
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    
    IF NOT v_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to create referral code for customer
CREATE FUNCTION create_customer_referral_code(p_customer_id uuid)
RETURNS text AS $$
DECLARE
  v_code text;
BEGIN
  -- Check if customer already has a referral code
  SELECT code INTO v_code 
  FROM referral_codes 
  WHERE customer_id = p_customer_id AND is_active = true;
  
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;
  
  -- Generate new referral code
  v_code := generate_referral_code();
  
  INSERT INTO referral_codes (customer_id, code, expires_at)
  VALUES (p_customer_id, v_code, now() + interval '1 year');
  
  -- Update customer record
  UPDATE customers 
  SET referral_code = v_code 
  WHERE id = p_customer_id;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to process referral
CREATE FUNCTION process_referral(
  p_referral_code text,
  p_referred_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  reward_amount numeric
) AS $$
DECLARE
  v_referral referral_codes%ROWTYPE;
  v_referrer_id uuid;
  v_existing_referral referral_transactions%ROWTYPE;
  v_reward_amount numeric DEFAULT 5.00;
BEGIN
  -- Validate referral code
  SELECT * INTO v_referral
  FROM referral_codes 
  WHERE code = UPPER(p_referral_code) 
  AND is_active = true 
  AND (expires_at IS NULL OR expires_at > now())
  AND current_uses < max_uses;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid or expired referral code', 0::numeric;
    RETURN;
  END IF;
  
  v_referrer_id := v_referral.customer_id;
  
  -- Check if customer is trying to refer themselves
  IF v_referrer_id = p_referred_id THEN
    RETURN QUERY SELECT false, 'Cannot refer yourself', 0::numeric;
    RETURN;
  END IF;
  
  -- Check if this referral already exists
  SELECT * INTO v_existing_referral
  FROM referral_transactions 
  WHERE referral_code_id = v_referral.id 
  AND referred_id = p_referred_id;
  
  IF FOUND THEN
    RETURN QUERY SELECT false, 'Referral already used', 0::numeric;
    RETURN;
  END IF;
  
  -- Create referral transaction
  INSERT INTO referral_transactions (
    referral_code_id, referrer_id, referred_id, order_id, reward_amount
  ) VALUES (
    v_referral.id, v_referrer_id, p_referred_id, p_order_id, v_reward_amount
  );
  
  -- Update referral code usage
  UPDATE referral_codes 
  SET current_uses = current_uses + 1 
  WHERE id = v_referral.id;
  
  -- Update referred customer record
  UPDATE customers 
  SET referred_by = v_referrer_id 
  WHERE id = p_referred_id;
  
  -- Add reward to referrer
  UPDATE customers 
  SET referral_credits = referral_credits + v_reward_amount 
  WHERE id = v_referrer_id;
  
  -- Create reward record
  INSERT INTO referral_rewards (
    customer_id, transaction_id, reward_amount, reward_type
  ) VALUES (
    v_referrer_id, 
    (SELECT id FROM referral_transactions WHERE referral_code_id = v_referral.id AND referred_id = p_referred_id),
    v_reward_amount,
    'credit'
  );
  
  RETURN QUERY SELECT true, 'Referral processed successfully', v_reward_amount;
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to apply referral credits
CREATE FUNCTION apply_referral_credits(
  p_customer_id uuid,
  p_order_id uuid,
  p_amount_to_apply numeric
)
RETURNS numeric AS $$
DECLARE
  v_available_credits numeric;
  v_applied_amount numeric;
BEGIN
  -- Get available credits
  SELECT COALESCE(referral_credits, 0) INTO v_available_credits
  FROM customers 
  WHERE id = p_customer_id;
  
  -- Calculate amount to apply (don't exceed available credits)
  v_applied_amount := LEAST(p_amount_to_apply, v_available_credits);
  
  IF v_applied_amount > 0 THEN
    -- Update customer credits
    UPDATE customers 
    SET referral_credits = referral_credits - v_applied_amount 
    WHERE id = p_customer_id;
    
    -- Mark rewards as applied (using subquery to avoid ORDER BY in UPDATE)
    UPDATE referral_rewards 
    SET is_applied = true, applied_at = now(), order_id = p_order_id
    WHERE id IN (
      SELECT id 
      FROM referral_rewards 
      WHERE customer_id = p_customer_id 
      AND is_applied = false
      ORDER BY created_at ASC
      LIMIT CEIL(v_applied_amount / 5.0)
    );
  END IF;
  
  RETURN v_applied_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to get referral stats
CREATE FUNCTION get_referral_stats(p_customer_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_referrals bigint,
  active_referrals bigint,
  total_rewards numeric,
  pending_rewards numeric,
  referral_code text,
  referral_link text
) AS $$
BEGIN
  RETURN QUERY
  WITH referral_stats AS (
    SELECT 
      COUNT(*) as total_referrals,
      COUNT(CASE WHEN o.created_at >= now() - interval '30 days' THEN 1 END) as active_referrals,
      COALESCE(SUM(rt.reward_amount), 0) as total_rewards,
      COALESCE(SUM(CASE WHEN NOT rr.is_applied THEN rt.reward_amount ELSE 0 END), 0) as pending_rewards
    FROM referral_codes rc
    LEFT JOIN referral_transactions rt ON rc.id = rt.referral_code_id
    LEFT JOIN referral_rewards rr ON rt.id = rr.transaction_id
    LEFT JOIN orders o ON rt.referred_id = o.customer_id AND o.status = 'delivered'
    WHERE rc.customer_id = COALESCE(p_customer_id, rc.customer_id)
    AND rc.is_active = true
  )
  SELECT 
    rs.total_referrals,
    rs.active_referrals,
    rs.total_rewards,
    rs.pending_rewards,
    rc.code,
    'https://order.restaurant.qa?ref=' || rc.code as referral_link
  FROM referral_stats rs
  JOIN referral_codes rc ON rc.is_active = true 
    AND rc.customer_id = COALESCE(p_customer_id, rc.customer_id);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Customers can view their own referral codes
CREATE POLICY "Customers can view own referral codes" ON referral_codes
  FOR SELECT USING (auth.uid() = customer_id);

-- Customers can view their own referral transactions
CREATE POLICY "Customers can view own referral transactions" ON referral_transactions
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Customers can view their own referral rewards
CREATE POLICY "Customers can view own referral rewards" ON referral_rewards
  FOR SELECT USING (auth.uid() = customer_id);

-- Staff can manage all referral data
CREATE POLICY "Staff can manage referral data" ON referral_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Staff can manage referral transactions" ON referral_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Staff can manage referral rewards" ON referral_rewards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_referral_code TO authenticated;
GRANT EXECUTE ON FUNCTION create_customer_referral_code TO authenticated;
GRANT EXECUTE ON FUNCTION process_referral TO authenticated;
GRANT EXECUTE ON FUNCTION apply_referral_credits TO authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats TO authenticated;

-- END MIGRATION: 0070_referral_program.sql


-- ============================================================
-- BEGIN MIGRATION: 0071_promotion_time_fields_v2.sql
-- ============================================================

-- ============================================================
-- Add Time Range Fields to Promotions (Safe Version)
-- ============================================================

-- Check if columns exist before adding them
DO $$
BEGIN
    -- Check if valid_from_time column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'promotions' 
        AND column_name = 'valid_from_time'
    ) THEN
        -- Add valid_from_time column
        ALTER TABLE promotions ADD COLUMN valid_from_time time;
    END IF;

    -- Check if valid_until_time column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'promotions' 
        AND column_name = 'valid_until_time'
    ) THEN
        -- Add valid_until_time column
        ALTER TABLE promotions ADD COLUMN valid_until_time time;
    END IF;

    -- Update existing promotions to have default time values
    UPDATE promotions 
    SET valid_from_time = '00:00:00', 
        valid_until_time = '23:59:59'
    WHERE valid_from_time IS NULL OR valid_until_time IS NULL;
END $$;

-- Add index for time-based queries
CREATE INDEX IF NOT EXISTS idx_promotions_time_range ON promotions(is_active, valid_from, valid_until, valid_from_time, valid_until_time)
WHERE is_active = true;

-- END MIGRATION: 0071_promotion_time_fields_v2.sql


-- ============================================================
-- BEGIN MIGRATION: 008_free_delivery_config_v2.sql
-- ============================================================

-- ============================================================
-- Add Free Delivery Configuration (Safe Version)
-- ============================================================

-- Check if config exists before inserting
DO $$
BEGIN
    -- Check if free_delivery_enabled already exists
    IF EXISTS (
        SELECT 1 FROM system_config 
        WHERE key = 'free_delivery_enabled'
    ) THEN
        -- Update existing value
        UPDATE system_config 
        SET value = 'false'
        WHERE key = 'free_delivery_enabled';
    ELSE
        -- Insert new value
        INSERT INTO system_config (key, value, description) VALUES 
        ('free_delivery_enabled', 'false', 'Enable free delivery for all orders');
    END IF;

    -- Check if free_delivery_min_order already exists
    IF EXISTS (
        SELECT 1 FROM system_config 
        WHERE key = 'free_delivery_min_order'
    ) THEN
        -- Update existing value
        UPDATE system_config 
        SET value = '0.000'
        WHERE key = 'free_delivery_min_order';
    ELSE
        -- Insert new value
        INSERT INTO system_config (key, value, description) VALUES 
        ('free_delivery_min_order', '0.000', 'Minimum order value for free delivery');
    END IF;

    -- Update existing delivery_fee description
    UPDATE system_config 
    SET description = 'Standard delivery fee when not free'
    WHERE key = 'delivery_fee';
END $$;

-- END MIGRATION: 008_free_delivery_config_v2.sql


-- ============================================================
-- BEGIN MIGRATION: 009_update_existing_configs.sql
-- ============================================================

-- ============================================================
-- Update Existing Configuration Values
-- ============================================================

-- Update delivery fee to match admin panel setting
UPDATE system_config 
SET value = '1.000'
WHERE key = 'delivery_fee' AND value != '1.000';

-- Ensure free delivery is disabled (will be enabled manually if needed)
UPDATE system_config 
SET value = 'false'
WHERE key = 'free_delivery_enabled' AND value != 'false';

-- END MIGRATION: 009_update_existing_configs.sql


-- ============================================================
-- BEGIN MIGRATION: 010_fix_all_issues.sql
-- ============================================================

-- ============================================================
-- Comprehensive Fix for All Configuration Issues
-- ============================================================

-- Reset all configurations to proper defaults
DELETE FROM system_config WHERE key IN ('delivery_fee', 'free_delivery_enabled', 'free_delivery_min_order');

-- Insert correct configuration values
INSERT INTO system_config (key, value, description) VALUES 
('delivery_fee', '1.000', 'Standard delivery fee when not free'),
('free_delivery_enabled', 'false', 'Enable free delivery for all orders'),
('free_delivery_min_order', '0.000', 'Minimum order value for free delivery');

-- Reset promotion time fields to defaults for existing records
UPDATE promotions 
SET valid_from_time = '00:00:00', 
    valid_until_time = '23:59:59'
WHERE valid_from_time IS NULL OR valid_until_time IS NULL;

-- Ensure proper indexes exist
DROP INDEX IF EXISTS idx_promotions_time_range;
CREATE INDEX idx_promotions_time_range ON promotions(is_active, valid_from, valid_until, valid_from_time, valid_until_time)
WHERE is_active = true;

-- END MIGRATION: 010_fix_all_issues.sql


-- ============================================================
-- BEGIN MIGRATION: 0110_fix_promotion_rls.sql
-- ============================================================

-- Fix RLS policies for promotion_categories and related tables
-- This migration fixes the 403 Forbidden error on promotion_categories endpoint

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_categories" ON promotion_categories;

DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_products" ON promotion_products;

-- Create new RLS policies for promotion_categories
CREATE POLICY "Enable read access for authenticated users on promotion_categories"
ON promotion_categories
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on promotion_categories"
ON promotion_categories
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_categories"
ON promotion_categories
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_categories"
ON promotion_categories
FOR DELETE USING (auth.role() = 'authenticated');

-- Create new RLS policies for promotion_products
CREATE POLICY "Enable read access for authenticated users on promotion_products"
ON promotion_products
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on promotion_products"
ON promotion_products
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_products"
ON promotion_products
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_products"
ON promotion_products
FOR DELETE USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled on these tables
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON promotion_categories TO authenticated;
GRANT ALL ON promotion_products TO authenticated;
GRANT SELECT ON promotion_categories TO anon;
GRANT SELECT ON promotion_products TO anon;

-- END MIGRATION: 0110_fix_promotion_rls.sql


-- ============================================================
-- BEGIN MIGRATION: 0111_fix_promotion_rls_v2.sql
-- ============================================================

-- Fix RLS policies for promotion_categories and related tables
-- This migration fixes the 403 Forbidden error on promotion_categories endpoint

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_categories" ON promotion_categories;

DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_products" ON promotion_products;

-- Create new RLS policies for promotion_categories
CREATE POLICY "Enable read access for authenticated users on promotion_categories"
ON promotion_categories
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on promotion_categories"
ON promotion_categories
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_categories"
ON promotion_categories
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_categories"
ON promotion_categories
FOR DELETE USING (auth.role() = 'authenticated');

-- Create new RLS policies for promotion_products
CREATE POLICY "Enable read access for authenticated users on promotion_products"
ON promotion_products
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on promotion_products"
ON promotion_products
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_products"
ON promotion_products
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_products"
ON promotion_products
FOR DELETE USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled on these tables
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON promotion_categories TO authenticated;
GRANT ALL ON promotion_products TO authenticated;
GRANT SELECT ON promotion_categories TO anon;
GRANT SELECT ON promotion_products TO anon;

-- END MIGRATION: 0111_fix_promotion_rls_v2.sql


-- ============================================================
-- BEGIN MIGRATION: 013_fix_anon_promotion_access.sql
-- ============================================================

-- Fix RLS policies to allow anon access to promotion_products and promotion_categories
-- This fixes the issue where customer app cannot access promotional data

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_products" ON promotion_products;

DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_categories" ON promotion_categories;

-- Create new policies that allow both anon and authenticated access for reading
CREATE POLICY "Enable read access for all users on promotion_products"
ON promotion_products
FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Enable insert for authenticated users on promotion_products"
ON promotion_products
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_products"
ON promotion_products
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_products"
ON promotion_products
FOR DELETE USING (auth.role() = 'authenticated');

-- Create new policies for promotion_categories
CREATE POLICY "Enable read access for all users on promotion_categories"
ON promotion_categories
FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "Enable insert for authenticated users on promotion_categories"
ON promotion_categories
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_categories"
ON promotion_categories
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_categories"
ON promotion_categories
FOR DELETE USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled
ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT SELECT ON promotion_products TO anon;
GRANT SELECT ON promotion_categories TO anon;
GRANT ALL ON promotion_products TO authenticated;
GRANT ALL ON promotion_categories TO authenticated;

-- END MIGRATION: 013_fix_anon_promotion_access.sql


-- ============================================================
-- BEGIN MIGRATION: 014_fix_inventory_permissions.sql
-- ============================================================

-- Fix inventory function permissions
-- Grant execute permission on update_product_stock function to authenticated users with proper roles

-- Drop existing function and recreate with proper security
DROP FUNCTION IF EXISTS update_product_stock(uuid, integer, text, text, uuid, text);

-- Recreate function with security definer
CREATE OR REPLACE FUNCTION update_product_stock(
  p_product_id uuid,
  p_quantity_change integer,
  p_transaction_type text,
  p_reason text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_current_stock integer;
  v_new_stock integer;
  v_user_role text;
BEGIN
  -- Get user role from staff table
  SELECT app_role INTO v_user_role
  FROM staff
  WHERE id = auth.uid();
  
  -- Check if user has proper permissions
  IF v_user_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to update inventory';
  END IF;
  
  -- Get current stock
  SELECT stock_level INTO v_current_stock
  FROM products
  WHERE id = p_product_id AND is_stock_tracked = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or stock tracking not enabled';
  END IF;
  
  -- Calculate new stock
  v_new_stock := v_current_stock + p_quantity_change;
  
  -- Validate stock doesn't go negative (except for adjustments)
  IF v_new_stock < 0 AND p_transaction_type != 'adjustment' THEN
    RAISE EXCEPTION 'Insufficient stock for this transaction';
  END IF;
  
  -- Update product stock
  UPDATE products
  SET 
    stock_level = v_new_stock,
    last_stock_update = now()
  WHERE id = p_product_id;
  
  -- Create transaction record
  INSERT INTO inventory_transactions (
    product_id,
    transaction_type,
    quantity_change,
    quantity_before,
    quantity_after,
    reason,
    staff_id,
    notes
  ) VALUES (
    p_product_id,
    p_transaction_type,
    p_quantity_change,
    v_current_stock,
    v_new_stock,
    p_reason,
    p_staff_id,
    p_notes
  );
  
  -- Check for low stock alert
  IF v_new_stock <= (SELECT low_stock_threshold FROM products WHERE id = p_product_id) THEN
    INSERT INTO low_stock_alerts (product_id, current_stock, threshold)
    VALUES (
      p_product_id,
      v_new_stock,
      (SELECT low_stock_threshold FROM products WHERE id = p_product_id)
    )
    ON CONFLICT (product_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_product_stock TO authenticated;

-- END MIGRATION: 014_fix_inventory_permissions.sql


-- ============================================================
-- BEGIN MIGRATION: 015_restaurant_settings.sql
-- ============================================================

-- ============================================================
-- Restaurant Settings
-- ============================================================

-- Restaurant settings table for admin customization
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_name_en text NOT NULL DEFAULT 'The Restaurant',
  restaurant_name_ar text NOT NULL DEFAULT 'Ø§Ù„Ù…Ø·Ø¹Ù…',
  restaurant_tagline_en text DEFAULT 'A Premium Experience',
  restaurant_tagline_ar text DEFAULT 'ØªØ¬Ø±Ø¨Ø© ÙØ§Ø®Ø±Ø©',
  logo_url text,
  contact_phone text DEFAULT '+966-50-123-4567',
  contact_email text DEFAULT 'info@restaurant.com',
  contact_address_en text,
  contact_address_ar text,
  social_facebook text,
  social_instagram text,
  social_twitter text,
  social_whatsapp text,
  delivery_banner_enabled boolean NOT NULL DEFAULT false,
  delivery_banner_text_en text,
  delivery_banner_text_ar text,
  delivery_threshold numeric DEFAULT 50,
  currency_code text NOT NULL DEFAULT 'QAR',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO restaurant_settings (
  restaurant_name_en, restaurant_name_ar, restaurant_tagline_en, restaurant_tagline_ar,
  delivery_banner_text_en, delivery_banner_text_ar
) VALUES (
  'The Restaurant', 'Ø§Ù„Ù…Ø·Ø¹Ù…', 'A Premium Experience', 'ØªØ¬Ø±Ø¨Ø© ÙØ§Ø®Ø±Ø©',
  'Free delivery on orders over 50 QAR', 'ØªÙˆØµÙŠÙ„ Ù…Ø¬Ø§Ù†ÙŠ Ù„Ù„Ø·Ù„Ø¨Ø§Øª ÙÙˆÙ‚ 50 Ø±ÙŠØ§Ù„'
) ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view and update settings
CREATE POLICY "Admins can view settings" ON restaurant_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Admins can update settings" ON restaurant_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Public can view settings (for customer app)
CREATE POLICY "Public can view settings" ON restaurant_settings
  FOR SELECT USING (true);

-- END MIGRATION: 015_restaurant_settings.sql


-- ============================================================
-- BEGIN MIGRATION: 016_add_color_scheme_to_settings.sql
-- ============================================================

-- ============================================================
-- Add Color Scheme to Restaurant Settings
-- ============================================================

-- Add color scheme columns to restaurant_settings table
ALTER TABLE restaurant_settings 
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#b8975a',
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#d4a574',
ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#c19a6b',
ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#faf8f4',
ADD COLUMN IF NOT EXISTS surface_color TEXT DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT '#2c1810',
ADD COLUMN IF NOT EXISTS text_muted_color TEXT DEFAULT '#6b5d54',
ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT '#e5ddd5',
ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Inter, system-ui, sans-serif',
ADD COLUMN IF NOT EXISTS heading_font TEXT DEFAULT 'Playfair Display, serif';

-- Update existing records with default color values
UPDATE restaurant_settings 
SET 
  primary_color = COALESCE(primary_color, '#b8975a'),
  secondary_color = COALESCE(secondary_color, '#d4a574'),
  accent_color = COALESCE(accent_color, '#c19a6b'),
  background_color = COALESCE(background_color, '#faf8f4'),
  surface_color = COALESCE(surface_color, '#ffffff'),
  text_color = COALESCE(text_color, '#2c1810'),
  text_muted_color = COALESCE(text_muted_color, '#6b5d54'),
  border_color = COALESCE(border_color, '#e5ddd5'),
  font_family = COALESCE(font_family, 'Inter, system-ui, sans-serif'),
  heading_font = COALESCE(heading_font, 'Playfair Display, serif')
WHERE primary_color IS NULL 
   OR secondary_color IS NULL 
   OR accent_color IS NULL 
   OR background_color IS NULL 
   OR surface_color IS NULL 
   OR text_color IS NULL 
   OR text_muted_color IS NULL 
   OR border_color IS NULL 
   OR font_family IS NULL 
   OR heading_font IS NULL;

-- END MIGRATION: 016_add_color_scheme_to_settings.sql


-- ============================================================
-- BEGIN MIGRATION: 0170_create_storage_buckets.sql
-- ============================================================

-- ============================================================
-- Create Storage Buckets
-- ============================================================

-- Create restaurant bucket for logos and images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant',
  'restaurant',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create menu bucket for product images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu',
  'menu',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for restaurant bucket
CREATE POLICY "Anyone can view restaurant images" ON storage.objects
FOR SELECT USING (bucket_id = 'restaurant');

CREATE POLICY "Authenticated users can upload restaurant images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'restaurant' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update their restaurant images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'restaurant' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete their restaurant images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'restaurant' AND 
  auth.role() = 'authenticated'
);

-- Create RLS policies for menu bucket
CREATE POLICY "Anyone can view menu images" ON storage.objects
FOR SELECT USING (bucket_id = 'menu');

CREATE POLICY "Authenticated users can upload menu images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'menu' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update their menu images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'menu' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete their menu images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'menu' AND 
  auth.role() = 'authenticated'
);

-- END MIGRATION: 0170_create_storage_buckets.sql


-- ============================================================
-- BEGIN MIGRATION: 0171_guest_experience_restaurant_settings.sql
-- ============================================================

-- Guest experience & service modes for luxury positioning (customer-facing)

ALTER TABLE restaurant_settings
ADD COLUMN IF NOT EXISTS enable_service_dine_in boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_service_takeaway boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_service_delivery boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS hero_title_en text,
ADD COLUMN IF NOT EXISTS hero_title_ar text,
ADD COLUMN IF NOT EXISTS hero_subtitle_en text,
ADD COLUMN IF NOT EXISTS hero_subtitle_ar text,
ADD COLUMN IF NOT EXISTS hero_image_url text,
ADD COLUMN IF NOT EXISTS cancellation_policy_en text,
ADD COLUMN IF NOT EXISTS cancellation_policy_ar text,
ADD COLUMN IF NOT EXISTS meta_description_en text,
ADD COLUMN IF NOT EXISTS meta_description_ar text;

COMMENT ON COLUMN restaurant_settings.enable_service_dine_in IS 'Show dine-in option in guest ordering UX';
COMMENT ON COLUMN restaurant_settings.hero_title_en IS 'Optional editorial hero headline (English)';

-- END MIGRATION: 0171_guest_experience_restaurant_settings.sql


-- ============================================================
-- BEGIN MIGRATION: 018_customer_phone_partial_unique.sql
-- ============================================================

-- Allow nullable phone for legacy-row reconciliation when linking auth.users.id to customers.
-- Partial unique index keeps phone unique among rows that have a number.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_e164_key;

ALTER TABLE customers
  ALTER COLUMN phone_e164 DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_e164_unique
  ON customers (phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- END MIGRATION: 018_customer_phone_partial_unique.sql


-- ============================================================
-- BEGIN MIGRATION: 019_staff_admin_read_policies.sql
-- ============================================================

-- Allow staff roles to read orders and customer profiles in Admin app.
-- NOTE: Uses `auth.jwt()` app_metadata.role claims set by your staff provisioning flow.

-- Orders: staff can read all orders
DROP POLICY IF EXISTS "orders_staff_read" ON orders;
CREATE POLICY "orders_staff_read" ON orders
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );

-- Order items: staff can read all order items
DROP POLICY IF EXISTS "order_items_staff_read" ON order_items;
CREATE POLICY "order_items_staff_read" ON order_items
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );

-- Customers: staff can read customer details (name/phone/email) for orders list
DROP POLICY IF EXISTS "customers_staff_read" ON customers;
CREATE POLICY "customers_staff_read" ON customers
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );


-- END MIGRATION: 019_staff_admin_read_policies.sql


-- ============================================================
-- BEGIN MIGRATION: 020_staff_admin_read_policies_v2.sql
-- ============================================================

-- v2: Staff read policies based on presence in `staff` table (not JWT claims).
-- This avoids relying on `app_metadata.role` being correctly set on the token.

-- Staff definition: `staff.id` references `auth.users(id)` and has `is_active`.

-- Orders: staff can read all orders
DROP POLICY IF EXISTS "orders_staff_read" ON orders;
CREATE POLICY "orders_staff_reavd" ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- Order items: staff can read all order items
DROP POLICY IF EXISTS "order_items_staff_read" ON order_items;
CREATE POLICY "order_items_staff_read" ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- Customers: staff can read customer details for operations
DROP POLICY IF EXISTS "customers_staff_read" ON customers;
CREATE POLICY "customers_staff_read" ON customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );


-- END MIGRATION: 020_staff_admin_read_policies_v2.sql


-- ============================================================
-- BEGIN MIGRATION: 021_staff_self_read.sql
-- ============================================================

-- Allow a staff user to read their own `staff` row.
-- Needed for RLS policies on other tables that check staff membership via EXISTS.

DROP POLICY IF EXISTS "staff_self_read" ON staff;
CREATE POLICY "staff_self_read" ON staff
  FOR SELECT TO authenticated
  USING (id = auth.uid());


-- END MIGRATION: 021_staff_self_read.sql


-- ============================================================
-- BEGIN MIGRATION: 022_admin_realtime_and_staff_access_fixes.sql
-- ============================================================

-- Fix staff read policy typo and enable realtime for orders.

-- 1) Fix typo from 020 migration ("orders_staff_reavd" should be "orders_staff_read")
DROP POLICY IF EXISTS "orders_staff_reavd" ON orders;
DROP POLICY IF EXISTS "orders_staff_read" ON orders;
CREATE POLICY "orders_staff_read" ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- 2) Allow staff to read drivers (admin UI embeds drivers on orders)
DROP POLICY IF EXISTS "drivers_staff_read" ON drivers;
CREATE POLICY "drivers_staff_read" ON drivers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- 3) Realtime: ensure updates stream to admin without manual refresh
-- This is safe to run multiple times.
ALTER TABLE orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Add to realtime publication if it exists (hosted Supabase uses `supabase_realtime`)
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
    END IF;
  END IF;
END $$;


-- END MIGRATION: 022_admin_realtime_and_staff_access_fixes.sql


-- ============================================================
-- BEGIN MIGRATION: 023_audit_logs.sql
-- ============================================================

-- Audit logs for critical actions (payment collection, staff actions, etc.)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      text NOT NULL,
  actor_id    uuid,
  actor_role  text,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Staff can read audit logs
DROP POLICY IF EXISTS "audit_logs_staff_read" ON audit_logs;
CREATE POLICY "audit_logs_staff_read" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM staff s WHERE s.id = auth.uid() AND s.is_active = true)
  );


-- END MIGRATION: 023_audit_logs.sql


-- ============================================================
-- BEGIN MIGRATION: 024_marketing_opt_out.sql
-- ============================================================

-- Customer marketing preferences (unsubscribe)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_marketing_opt_out ON customers(marketing_opt_out);


-- END MIGRATION: 024_marketing_opt_out.sql


-- ============================================================
-- BEGIN MIGRATION: 026_combo_promotions.sql
-- ============================================================

-- Dedicated combo promotions for fixed-price meal bundles.

CREATE TABLE IF NOT EXISTS combo_promotions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  name_en           text NOT NULL,
  name_ar           text NOT NULL,
  headline_en       text,
  headline_ar       text,
  description_en    text,
  description_ar    text,
  promo_price       numeric(10,3) NOT NULL CHECK (promo_price >= 0),
  original_price    numeric(10,3) NOT NULL CHECK (original_price >= promo_price),
  image_url         text,
  model_asset_url   text,
  badge_text_en     text,
  badge_text_ar     text,
  accent_color      text NOT NULL DEFAULT '#B8975A',
  secondary_color   text NOT NULL DEFAULT '#6D28D9',
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  is_featured       boolean NOT NULL DEFAULT true,
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS combo_promotion_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  combo_promotion_id  uuid NOT NULL REFERENCES combo_promotions(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  item_role           text NOT NULL DEFAULT 'main'
                      CHECK (item_role IN ('main', 'side', 'drink', 'dessert', 'optional_drink')),
  quantity            int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  display_order       int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_promotions_active_featured
  ON combo_promotions(is_active, is_featured, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_combo_promotions_schedule
  ON combo_promotions(starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo
  ON combo_promotion_items(combo_promotion_id);

CREATE INDEX IF NOT EXISTS idx_combo_items_product
  ON combo_promotion_items(product_id);

DROP TRIGGER IF EXISTS trg_combo_promotions_updated_at ON combo_promotions;
CREATE TRIGGER trg_combo_promotions_updated_at
  BEFORE UPDATE ON combo_promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE combo_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_promotion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_promotions_public_read_active" ON combo_promotions;
CREATE POLICY "combo_promotions_public_read_active" ON combo_promotions
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS "combo_promotions_authenticated_read_all" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_read_all" ON combo_promotions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_promotions_authenticated_insert" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_insert" ON combo_promotions
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotions_authenticated_update" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_update" ON combo_promotions
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotions_authenticated_delete" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_delete" ON combo_promotions
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_promotion_items_public_read_active" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_public_read_active" ON combo_promotion_items
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM combo_promotions cp
      WHERE cp.id = combo_promotion_items.combo_promotion_id
        AND cp.is_active = true
        AND (cp.starts_at IS NULL OR cp.starts_at <= now())
        AND (cp.ends_at IS NULL OR cp.ends_at > now())
    )
  );

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_read_all" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_read_all" ON combo_promotion_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_insert" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_insert" ON combo_promotion_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_update" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_update" ON combo_promotion_items
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_delete" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_delete" ON combo_promotion_items
  FOR DELETE TO authenticated
  USING (true);

-- END MIGRATION: 026_combo_promotions.sql


-- ============================================================
-- BEGIN MIGRATION: 027_operator_notifications.sql
-- ============================================================

-- Operator notifications: private config, realtime in-app events, and delivery logs.

INSERT INTO system_config (key, value, description)
VALUES (
  'operator_notifications',
  '{
    "email_enabled": false,
    "email_recipients": [],
    "telegram_enabled": false,
    "telegram_chat_ids": [],
    "notify_on_order_created": true,
    "notify_on_order_cancelled": true
  }'::jsonb,
  'Operator notification channel settings'
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS operator_notifications (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN ('order.created', 'order.cancelled')),
  audience_roles    text[] NOT NULL DEFAULT ARRAY['admin', 'manager']::text[],
  title             text NOT NULL,
  message           text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (
    audience_roles <@ ARRAY['admin', 'manager', 'supervisor']::text[]
    AND array_length(audience_roles, 1) IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS operator_notification_deliveries (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  notification_id   uuid REFERENCES operator_notifications(id) ON DELETE SET NULL,
  event_type        text NOT NULL CHECK (event_type IN ('order.created', 'order.cancelled')),
  channel           text NOT NULL CHECK (channel IN ('in_app', 'email', 'telegram')),
  recipient         text,
  status            text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  response_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operator_notification_secrets (
  key_name           text PRIMARY KEY,
  organization_id    uuid,
  cluster_id         uuid,
  property_id        uuid,
  ciphertext         text NOT NULL,
  iv                 text NOT NULL,
  key_version        int NOT NULL DEFAULT 1,
  updated_by         uuid REFERENCES staff(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (key_name IN ('telegram_bot_token'))
);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_order_id
  ON operator_notifications(order_id);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_created_at
  ON operator_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operator_notification_deliveries_order_id
  ON operator_notification_deliveries(order_id);

CREATE INDEX IF NOT EXISTS idx_operator_notification_deliveries_notification_id
  ON operator_notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_operator_notification_deliveries_status
  ON operator_notification_deliveries(channel, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_operator_notifications_updated_at ON operator_notifications;
CREATE TRIGGER trg_operator_notifications_updated_at
  BEFORE UPDATE ON operator_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_operator_notification_deliveries_updated_at ON operator_notification_deliveries;
CREATE TRIGGER trg_operator_notification_deliveries_updated_at
  BEFORE UPDATE ON operator_notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_operator_notification_secrets_updated_at ON operator_notification_secrets;
CREATE TRIGGER trg_operator_notification_secrets_updated_at
  BEFORE UPDATE ON operator_notification_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE operator_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_notification_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_notifications_staff_read" ON operator_notifications;
CREATE POLICY "operator_notifications_staff_read" ON operator_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
        AND s.app_role = ANY(operator_notifications.audience_roles)
    )
  );

DROP POLICY IF EXISTS "operator_notification_deliveries_staff_read" ON operator_notification_deliveries;
CREATE POLICY "operator_notification_deliveries_staff_read" ON operator_notification_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
        AND s.app_role IN ('admin', 'manager')
    )
  );

ALTER TABLE operator_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'operator_notifications'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_notifications';
    END IF;
  END IF;
END $$;

-- END MIGRATION: 027_operator_notifications.sql


-- ============================================================
-- BEGIN MIGRATION: 028_add_qpay_payments.sql
-- ============================================================

-- Add payments table for QPay / Dokhan / additional payment gateway transactions
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_provider text NOT NULL DEFAULT 'qpay'
    CHECK (payment_provider IN ('qpay', 'dokhan', 'other')),
  provider_transaction_id text,
  provider_payment_reference text,
  amount numeric(10,3) NOT NULL,
  currency text NOT NULL DEFAULT 'QAR',
  payment_method text NOT NULL DEFAULT 'online'
    CHECK (payment_method IN ('cash', 'card', 'online')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled')),
  provider_response jsonb,
  failure_code text,
  failure_message text,
  captured_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_transaction_id
  ON payments(provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(payment_provider);

-- END MIGRATION: 028_add_qpay_payments.sql


-- ============================================================
-- BEGIN MIGRATION: 029_add_product_search_vector.sql
-- ============================================================

-- Add a full-text search vector for products to support faster menu search
ALTER TABLE products
ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name_en, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(name_ar, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description_en, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description_ar, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON products USING GIN (search_vector);

-- END MIGRATION: 029_add_product_search_vector.sql


-- ============================================================
-- BEGIN MIGRATION: 20260511073642_combo_promotions.sql
-- ============================================================


-- END MIGRATION: 20260511073642_combo_promotions.sql


-- ============================================================
-- BEGIN MIGRATION: 20260511073946_combo_promotions.sql
-- ============================================================


-- END MIGRATION: 20260511073946_combo_promotions.sql


-- ============================================================
-- BEGIN MIGRATION: 20260511125111_operator_notifications.sql
-- ============================================================


-- END MIGRATION: 20260511125111_operator_notifications.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512081155_stripe_payment_foundations.sql
-- ============================================================


-- END MIGRATION: 20260512081155_stripe_payment_foundations.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512081245_stripe_payment_foundations.sql
-- ============================================================


-- END MIGRATION: 20260512081245_stripe_payment_foundations.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512081246_stripe_payment_foundations.sql
-- ============================================================


-- END MIGRATION: 20260512081246_stripe_payment_foundations.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512085636_payment_gateway_settings.sql
-- ============================================================

INSERT INTO system_config (key, value, description)
VALUES (
  'payment_gateway_settings',
  '{
    "stripe_enabled": false,
    "stripe_mode": "test",
    "checkout_label": "Pay online with Stripe"
  }'::jsonb,
  'Stripe checkout runtime settings for guest ordering'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value || system_config.value,
  description = EXCLUDED.description;

-- END MIGRATION: 20260512085636_payment_gateway_settings.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512093016_fix_customer_analytics_rpc.sql
-- ============================================================

-- Repair customer analytics RPCs and view for the admin analytics page.
-- The previous definitions referenced auth.users directly and had invalid
-- aggregate queries, which caused the admin customer analytics screen to fail.

DROP FUNCTION IF EXISTS get_customer_metrics(integer);
DROP FUNCTION IF EXISTS get_customer_segments();
DROP FUNCTION IF EXISTS get_cohort_analysis();
DROP FUNCTION IF EXISTS get_customer_lifetime_value();

CREATE FUNCTION get_customer_metrics(p_days integer DEFAULT 30)
RETURNS TABLE (
  total_customers bigint,
  new_customers_this_month bigint,
  repeat_customers bigint,
  average_orders_per_customer numeric,
  customer_retention_rate numeric,
  top_customers jsonb
) AS $$
DECLARE
  v_start_date timestamptz := now() - make_interval(days => GREATEST(p_days, 1));
  v_month_start timestamptz := date_trunc('month', now());
BEGIN
  RETURN QUERY
  WITH delivered_orders AS (
    SELECT o.customer_id, o.created_at, o.total
    FROM orders o
    WHERE o.status = 'delivered'
      AND o.customer_id IS NOT NULL
  ),
  all_time_rollup AS (
    SELECT
      d.customer_id,
      MIN(d.created_at) AS first_order_date,
      MAX(d.created_at) AS last_order_date,
      COUNT(*) AS lifetime_orders
    FROM delivered_orders d
    GROUP BY d.customer_id
  ),
  window_rollup AS (
    SELECT
      d.customer_id,
      COUNT(*) AS window_orders,
      SUM(d.total) AS total_spent,
      AVG(d.total) AS average_order_value,
      MAX(d.created_at) AS last_order_date
    FROM delivered_orders d
    WHERE d.created_at >= v_start_date
    GROUP BY d.customer_id
  ),
  summary AS (
    SELECT
      COUNT(*)::bigint AS total_customers,
      COUNT(*) FILTER (
        WHERE a.first_order_date >= v_month_start
      )::bigint AS new_customers_this_month,
      COUNT(*) FILTER (
        WHERE a.first_order_date < v_month_start
          AND EXISTS (
            SELECT 1
            FROM delivered_orders d
            WHERE d.customer_id = w.customer_id
              AND d.created_at >= v_month_start
          )
      )::bigint AS repeat_customers,
      COALESCE(AVG(w.window_orders::numeric), 0) AS average_orders_per_customer
    FROM window_rollup w
    JOIN all_time_rollup a ON a.customer_id = w.customer_id
  ),
  retention AS (
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN 0::numeric
        ELSE COUNT(*) FILTER (WHERE a.lifetime_orders > 1)::numeric / COUNT(*)::numeric
      END AS customer_retention_rate
    FROM window_rollup w
    JOIN all_time_rollup a ON a.customer_id = w.customer_id
  ),
  top_customers_data AS (
    SELECT
      w.customer_id,
      COALESCE(c.name, c.email, c.phone_e164, 'Guest') AS name,
      COALESCE(c.phone_e164, 'N/A') AS phone,
      w.window_orders AS total_orders,
      COALESCE(w.total_spent, 0) AS total_spent,
      COALESCE(w.average_order_value, 0) AS average_order_value,
      w.last_order_date
    FROM window_rollup w
    LEFT JOIN customers c ON c.id = w.customer_id
    ORDER BY w.total_spent DESC NULLS LAST, w.window_orders DESC, w.customer_id
    LIMIT 10
  )
  SELECT
    s.total_customers,
    s.new_customers_this_month,
    s.repeat_customers,
    s.average_orders_per_customer,
    r.customer_retention_rate,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'customer_id', t.customer_id,
            'name', t.name,
            'phone', t.phone,
            'total_orders', t.total_orders,
            'total_spent', t.total_spent,
            'average_order_value', t.average_order_value,
            'last_order_date', t.last_order_date
          )
          ORDER BY t.total_spent DESC, t.total_orders DESC
        )
        FROM top_customers_data t
      ),
      '[]'::jsonb
    ) AS top_customers
  FROM summary s
  CROSS JOIN retention r;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION get_customer_segments()
RETURNS TABLE (
  segment text,
  count bigint,
  percentage numeric,
  characteristics text[]
) AS $$
BEGIN
  RETURN QUERY
  WITH customer_totals AS (
    SELECT
      o.customer_id,
      COUNT(*) AS total_orders,
      SUM(o.total) AS total_spent
    FROM orders o
    WHERE o.status = 'delivered'
      AND o.customer_id IS NOT NULL
      AND o.created_at >= now() - interval '90 days'
    GROUP BY o.customer_id
  ),
  segment_assignments AS (
    SELECT
      CASE
        WHEN total_orders >= 10 AND total_spent >= 500 THEN 'VIP Customers'
        WHEN total_orders >= 5 AND total_spent >= 200 THEN 'Loyal Customers'
        WHEN total_orders >= 3 THEN 'Regular Customers'
        WHEN total_orders = 1 THEN 'New Customers'
        ELSE 'Inactive Customers'
      END AS segment
    FROM customer_totals
  ),
  segment_counts AS (
    SELECT sa.segment, COUNT(*)::bigint AS count
    FROM segment_assignments sa
    GROUP BY sa.segment
  ),
  total_customers AS (
    SELECT COALESCE(SUM(sc.count), 0)::numeric AS total
    FROM segment_counts sc
  )
  SELECT
    sc.segment,
    sc.count,
    CASE
      WHEN tc.total = 0 THEN 0::numeric
      ELSE (sc.count::numeric / tc.total) * 100
    END AS percentage,
    CASE
      WHEN sc.segment = 'VIP Customers' THEN ARRAY['High value', 'Frequent orders', 'Premium service']
      WHEN sc.segment = 'Loyal Customers' THEN ARRAY['Repeat business', 'Good spending', 'Regular visits']
      WHEN sc.segment = 'Regular Customers' THEN ARRAY['Multiple orders', 'Growing relationship']
      WHEN sc.segment = 'New Customers' THEN ARRAY['First time', 'Potential growth']
      WHEN sc.segment = 'Inactive Customers' THEN ARRAY['No recent orders', 'Re-engagement needed']
      ELSE ARRAY['Uncategorized']
    END AS characteristics
  FROM segment_counts sc
  CROSS JOIN total_customers tc
  ORDER BY sc.count DESC, sc.segment;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION get_cohort_analysis()
RETURNS TABLE (
  cohort text,
  customers bigint,
  retention_rates jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH delivered_orders AS (
    SELECT
      o.customer_id,
      date_trunc('month', o.created_at)::date AS order_month
    FROM orders o
    WHERE o.status = 'delivered'
      AND o.customer_id IS NOT NULL
  ),
  customer_cohorts AS (
    SELECT
      d.customer_id,
      MIN(d.order_month) AS cohort_month
    FROM delivered_orders d
    GROUP BY d.customer_id
  ),
  recent_cohorts AS (
    SELECT
      cc.cohort_month,
      COUNT(*)::bigint AS customers
    FROM customer_cohorts cc
    GROUP BY cc.cohort_month
    ORDER BY cc.cohort_month DESC
    LIMIT 12
  ),
  checkpoints AS (
    SELECT unnest(ARRAY[1, 2, 3, 6, 12]) AS month_number
  ),
  retention AS (
    SELECT
      rc.cohort_month,
      cp.month_number,
      COUNT(
        DISTINCT CASE
          WHEN d.customer_id IS NOT NULL THEN cc.customer_id
          ELSE NULL
        END
      )::numeric AS retained_customers,
      rc.customers::numeric AS cohort_size
    FROM recent_cohorts rc
    JOIN customer_cohorts cc
      ON cc.cohort_month = rc.cohort_month
    CROSS JOIN checkpoints cp
    LEFT JOIN delivered_orders d
      ON d.customer_id = cc.customer_id
      AND d.order_month = (rc.cohort_month + make_interval(months => cp.month_number - 1))::date
    GROUP BY rc.cohort_month, rc.customers, cp.month_number
  )
  SELECT
    to_char(rc.cohort_month, 'YYYY-MM') AS cohort,
    rc.customers,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'month', r.month_number,
            'rate',
            CASE
              WHEN r.cohort_size = 0 THEN 0::numeric
              ELSE r.retained_customers / r.cohort_size
            END
          )
          ORDER BY r.month_number
        )
        FROM retention r
        WHERE r.cohort_month = rc.cohort_month
      ),
      '[]'::jsonb
    ) AS retention_rates
  FROM recent_cohorts rc
  ORDER BY rc.cohort_month DESC;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION get_customer_lifetime_value()
RETURNS TABLE (
  total_customers bigint,
  average_ltv numeric,
  total_revenue numeric,
  monthly_ltv jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH delivered_orders AS (
    SELECT o.customer_id, o.created_at, o.total
    FROM orders o
    WHERE o.status = 'delivered'
      AND o.customer_id IS NOT NULL
  ),
  customer_ltv AS (
    SELECT
      d.customer_id,
      MIN(date_trunc('month', d.created_at)::date) AS first_order_month,
      SUM(d.total) AS lifetime_value
    FROM delivered_orders d
    GROUP BY d.customer_id
  ),
  ltv_stats AS (
    SELECT
      COUNT(*)::bigint AS total_customers,
      COALESCE(AVG(lifetime_value), 0) AS average_ltv,
      COALESCE(SUM(lifetime_value), 0) AS total_revenue
    FROM customer_ltv
  ),
  monthly_ltv_data AS (
    SELECT
      cl.first_order_month AS month_bucket,
      COUNT(*)::bigint AS new_customers,
      COALESCE(AVG(cl.lifetime_value), 0) AS avg_ltv
    FROM customer_ltv cl
    WHERE cl.first_order_month >= (date_trunc('month', now()) - interval '11 months')::date
    GROUP BY cl.first_order_month
    ORDER BY cl.first_order_month
  )
  SELECT
    ls.total_customers,
    ls.average_ltv,
    ls.total_revenue,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'month', to_char(m.month_bucket, 'YYYY-MM'),
            'new_customers', m.new_customers,
            'avg_ltv', m.avg_ltv
          )
          ORDER BY m.month_bucket
        )
        FROM monthly_ltv_data m
      ),
      '[]'::jsonb
    ) AS monthly_ltv
  FROM ltv_stats ls;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW customer_analytics
WITH (security_invoker = true) AS
SELECT
  c.id,
  COALESCE(c.name, c.email, c.phone_e164, 'Guest') AS name,
  COALESCE(c.phone_e164, 'N/A') AS phone,
  MIN(o.created_at) AS first_order_date,
  MAX(o.created_at) AS last_order_date,
  COUNT(*)::bigint AS total_orders,
  SUM(o.total) AS total_spent,
  AVG(o.total) AS average_order_value
FROM customers c
JOIN orders o
  ON o.customer_id = c.id
WHERE o.status = 'delivered'
GROUP BY c.id, c.name, c.email, c.phone_e164;

GRANT EXECUTE ON FUNCTION get_customer_metrics(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_segments() TO authenticated;
GRANT EXECUTE ON FUNCTION get_cohort_analysis() TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_lifetime_value() TO authenticated;
GRANT SELECT ON customer_analytics TO authenticated;

-- END MIGRATION: 20260512093016_fix_customer_analytics_rpc.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512102329_driver_module_rollout.sql
-- ============================================================


-- END MIGRATION: 20260512102329_driver_module_rollout.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512105001_order_availability_controls.sql
-- ============================================================


-- END MIGRATION: 20260512105001_order_availability_controls.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512110044_order_availability.sql
-- ============================================================


-- END MIGRATION: 20260512110044_order_availability.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512110207_order_availability.sql
-- ============================================================


-- END MIGRATION: 20260512110207_order_availability.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512111330_platform_feature_flags.sql
-- ============================================================

-- Phase 0 foundation: feature flags with tenant-aware scope for staged rollouts
CREATE TABLE IF NOT EXISTS feature_flags (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key           text NOT NULL,
  description        text,
  enabled            boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  rules              jsonb NOT NULL DEFAULT '{}'::jsonb,
  organization_id    uuid,
  cluster_id         uuid,
  property_id        uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_scope_key
  ON feature_flags (flag_key, organization_id, cluster_id, property_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_feature_flags_scope
  ON feature_flags (organization_id, cluster_id, property_id);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_staff_read" ON feature_flags;
CREATE POLICY "feature_flags_staff_read" ON feature_flags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DROP TRIGGER IF EXISTS set_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER set_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- END MIGRATION: 20260512111330_platform_feature_flags.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512111331_stripe_payment_foundations.sql
-- ============================================================

-- Phase 1 foundation: extend payment storage for Stripe retries, sessions, and webhook processing
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  ADD COLUMN IF NOT EXISTS provider_session_id text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS webhook_event_id text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_provider_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_provider_check
  CHECK (payment_provider IN ('qpay', 'stripe', 'dokhan', 'other'));

DROP INDEX IF EXISTS idx_payments_order_id;
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_attempt
  ON payments(order_id, attempt_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_session_id
  ON payments(provider_session_id)
  WHERE provider_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_webhook_event_id
  ON payments(webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_scope
  ON payments(organization_id, cluster_id, property_id);

DROP TRIGGER IF EXISTS set_payments_updated_at ON payments;
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_staff_read" ON payments;
CREATE POLICY "payments_staff_read" ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id       uuid REFERENCES payments(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('qpay', 'stripe', 'other')),
  event_id         text NOT NULL,
  event_type       text NOT NULL,
  livemode         boolean NOT NULL DEFAULT false,
  processed_at     timestamptz,
  processing_error text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  organization_id  uuid,
  cluster_id       uuid,
  property_id      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_event
  ON payment_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id
  ON payment_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_id
  ON payment_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_scope
  ON payment_webhook_events(organization_id, cluster_id, property_id);

ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_webhook_events_staff_read" ON payment_webhook_events;
CREATE POLICY "payment_webhook_events_staff_read" ON payment_webhook_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
        AND s.app_role IN ('admin', 'manager')
    )
  );

DROP TRIGGER IF EXISTS set_payment_webhook_events_updated_at ON payment_webhook_events;
CREATE TRIGGER set_payment_webhook_events_updated_at
  BEFORE UPDATE ON payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- END MIGRATION: 20260512111331_stripe_payment_foundations.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512130000_fix_customer_profile_trigger_pg_net.sql
-- ============================================================

-- Prevent delivered-status updates from failing when the async customer profile sync runs.
-- pg_net expects a json/jsonb body, and this trigger should never block the order status change.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_customer_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.customer_id IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/update-customer-profile',
        body := jsonb_build_object('order_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'trigger_customer_profile_update failed for order %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- END MIGRATION: 20260512130000_fix_customer_profile_trigger_pg_net.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512133000_driver_module_rollout.sql
-- ============================================================

-- Driver module rollout: auth-linked drivers, notification inbox, and lifecycle policies.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS login_email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE drivers
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'drivers_active_order_id_fkey'
  ) THEN
    ALTER TABLE drivers
      ADD CONSTRAINT drivers_active_order_id_fkey
      FOREIGN KEY (active_order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_drivers_active_order_id
  ON drivers(active_order_id);

CREATE INDEX IF NOT EXISTS idx_drivers_tenant_scope
  ON drivers(organization_id, cluster_id, property_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_auth_user_id_unique
  ON drivers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_login_email_unique
  ON drivers(login_email)
  WHERE login_email IS NOT NULL;

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers;
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE order_events
  DROP CONSTRAINT IF EXISTS order_events_actor_role_check;

ALTER TABLE order_events
  ADD CONSTRAINT order_events_actor_role_check
  CHECK (actor_role IN ('customer', 'driver', 'admin', 'manager', 'supervisor', 'system'));

CREATE TABLE IF NOT EXISTS driver_notifications (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  driver_id         uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN ('order.assigned', 'order.cancelled', 'order.updated', 'order.cash_collected')),
  title             text NOT NULL,
  message           text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_driver_id
  ON driver_notifications(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_order_id
  ON driver_notifications(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_tenant_scope
  ON driver_notifications(organization_id, cluster_id, property_id);

DROP TRIGGER IF EXISTS trg_driver_notifications_updated_at ON driver_notifications;
CREATE TRIGGER trg_driver_notifications_updated_at
  BEFORE UPDATE ON driver_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE driver_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_notifications REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "drivers_self_read" ON drivers;
CREATE POLICY "drivers_self_read" ON drivers
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    AND is_active = true
  );

DROP POLICY IF EXISTS "drivers_customer_tracking_read" ON drivers;
CREATE POLICY "drivers_customer_tracking_read" ON drivers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.driver_id = drivers.id
        AND o.customer_id = auth.uid()
        AND o.status IN ('dispatched', 'delivered')
    )
  );

DROP POLICY IF EXISTS "driver_notifications_driver_read" ON driver_notifications;
CREATE POLICY "driver_notifications_driver_read" ON driver_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.id = driver_notifications.driver_id
        AND d.auth_user_id = auth.uid()
        AND d.is_active = true
    )
  );

DROP POLICY IF EXISTS "driver_notifications_driver_update" ON driver_notifications;
CREATE POLICY "driver_notifications_driver_update" ON driver_notifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.id = driver_notifications.driver_id
        AND d.auth_user_id = auth.uid()
        AND d.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.id = driver_notifications.driver_id
        AND d.auth_user_id = auth.uid()
        AND d.is_active = true
    )
  );

DROP POLICY IF EXISTS "driver_notifications_staff_read" ON driver_notifications;
CREATE POLICY "driver_notifications_staff_read" ON driver_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'driver_notifications'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications';
    END IF;
  END IF;
END $$;

-- END MIGRATION: 20260512133000_driver_module_rollout.sql


-- ============================================================
-- BEGIN MIGRATION: 20260512140500_order_availability.sql
-- ============================================================

-- Per-property order availability: manual overrides, weekly schedule, and one-off date/time windows.

CREATE TABLE IF NOT EXISTS order_availability_settings (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  manual_mode         text NOT NULL DEFAULT 'scheduled'
                      CHECK (manual_mode IN ('scheduled', 'force_open', 'force_closed')),
  timezone            text NOT NULL DEFAULT 'Asia/Qatar',
  closure_message_en  text,
  closure_message_ar  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(timezone)) > 0)
);

CREATE TABLE IF NOT EXISTS order_availability_weekly_windows (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  day_of_week         int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at            time NOT NULL,
  closes_at           time NOT NULL,
  is_enabled          boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

CREATE TABLE IF NOT EXISTS order_availability_overrides (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  mode                text NOT NULL CHECK (mode IN ('open', 'closed')),
  label               text,
  message_en          text,
  message_ar          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_availability_settings_scope_unique
  ON order_availability_settings (organization_id, cluster_id, property_id) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_availability_weekly_scope_day_unique
  ON order_availability_weekly_windows (organization_id, cluster_id, property_id, day_of_week) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_order_availability_settings_scope
  ON order_availability_settings (organization_id, cluster_id, property_id);

CREATE INDEX IF NOT EXISTS idx_order_availability_weekly_scope
  ON order_availability_weekly_windows (organization_id, cluster_id, property_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_order_availability_overrides_scope
  ON order_availability_overrides (organization_id, cluster_id, property_id);

CREATE INDEX IF NOT EXISTS idx_order_availability_overrides_window
  ON order_availability_overrides (starts_at, ends_at);

DROP TRIGGER IF EXISTS trg_order_availability_settings_updated_at ON order_availability_settings;
CREATE TRIGGER trg_order_availability_settings_updated_at
  BEFORE UPDATE ON order_availability_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_order_availability_weekly_windows_updated_at ON order_availability_weekly_windows;
CREATE TRIGGER trg_order_availability_weekly_windows_updated_at
  BEFORE UPDATE ON order_availability_weekly_windows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_order_availability_overrides_updated_at ON order_availability_overrides;
CREATE TRIGGER trg_order_availability_overrides_updated_at
  BEFORE UPDATE ON order_availability_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE order_availability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_availability_weekly_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_availability_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_availability_settings_staff_read" ON order_availability_settings;
CREATE POLICY "order_availability_settings_staff_read" ON order_availability_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS "order_availability_weekly_windows_staff_read" ON order_availability_weekly_windows;
CREATE POLICY "order_availability_weekly_windows_staff_read" ON order_availability_weekly_windows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS "order_availability_overrides_staff_read" ON order_availability_overrides;
CREATE POLICY "order_availability_overrides_staff_read" ON order_availability_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- END MIGRATION: 20260512140500_order_availability.sql

