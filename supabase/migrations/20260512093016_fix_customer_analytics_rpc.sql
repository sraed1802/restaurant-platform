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
