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
