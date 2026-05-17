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
('restaurant_name_ar', '"المطعم"', 'Restaurant name in Arabic'),
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
 'تم استلام طلبك رقم #{{order_number}}. سنقوم بتأكيده قريباً. شكراً لاختيارك لنا.'),
('order.confirmed',
 'Great news! Order #{{order_number}} is confirmed and our kitchen is preparing your meal. Estimated delivery: {{eta}} minutes.',
 'أخبار رائعة! تم تأكيد طلبك رقم #{{order_number}} ومطبخنا يحضر وجبتك. وقت التوصيل المتوقع: {{eta}} دقيقة.'),
('order.ready',
 'Your order #{{order_number}} is ready and a driver will be assigned shortly.',
 'طلبك رقم #{{order_number}} جاهز وسيتم تعيين سائق قريباً.'),
('order.dispatched',
 'Your order is on the way! Driver {{driver_name}} is heading to you. Estimated arrival: {{eta}} minutes.',
 'طلبك في الطريق! السائق {{driver_name}} في طريقه إليك. وقت الوصول المتوقع: {{eta}} دقيقة.'),
('order.delivered',
 'Your order #{{order_number}} has been delivered. Enjoy your meal! We hope to see you again soon.',
 'تم توصيل طلبك رقم #{{order_number}}. استمتع بوجبتك! نأمل أن نراك مرة أخرى قريباً.'),
('order.cancelled',
 'Your order #{{order_number}} has been cancelled. Reason: {{reason}}. We apologize for any inconvenience.',
 'تم إلغاء طلبك رقم #{{order_number}}. السبب: {{reason}}. نعتذر عن أي إزعاج.');

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
