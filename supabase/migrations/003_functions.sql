-- ============================================================
-- RMS Platform - Database Functions & Stored Procedures
-- ============================================================

-- ── Safe order status transition (callable from edge functions) ──
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
    RAISE EXCEPTION 'Invalid status transition: % → %', v_order.status, p_to_status;
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

-- ── Get live order stats (used by dashboard KPIs) ──────────────
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

-- ── Get order funnel data for analytics ───────────────────────
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

-- ── RFM segmentation query ────────────────────────────────────
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

-- ── Refresh all materialized views (called by cron) ───────────
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

-- ── Schedule the combined refresh every 30 minutes ─────────────
SELECT cron.schedule('refresh-all-mv', '*/30 * * * *', 'SELECT refresh_all_mv()');

-- ── Auto-trigger customer profile update on delivery ──────────
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
