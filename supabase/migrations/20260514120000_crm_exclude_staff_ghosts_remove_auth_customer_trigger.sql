-- Stop mirroring every auth.users row into public.customers (that exposed staff / login-only rows in CRM).
-- CRM list: exclude staff accounts and "ghost" profiles (no phone, no name, never ordered).

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- Remove customer mirror rows for staff (same id as auth.users / staff.id)
DELETE FROM public.customers c
USING public.staff s
WHERE c.id = s.id;

DROP FUNCTION IF EXISTS public.crm_list_customers(integer);

CREATE OR REPLACE FUNCTION public.crm_list_customers(p_limit integer DEFAULT 500)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone_e164 text,
  total_orders integer,
  last_order_at timestamptz,
  created_at timestamptz,
  marketing_opt_out boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH stats AS (
    SELECT
      o.customer_id AS customer_id,
      COUNT(*)::integer AS order_count,
      MAX(o.created_at) AS last_at
    FROM orders o
    WHERE o.customer_id IS NOT NULL
      AND o.status IS DISTINCT FROM 'cancelled'
    GROUP BY o.customer_id
  )
  SELECT
    c.id,
    c.name,
    c.email,
    c.phone_e164,
    COALESCE(s.order_count, 0) AS total_orders,
    s.last_at AS last_order_at,
    c.created_at,
    c.marketing_opt_out
  FROM customers c
  LEFT JOIN stats s ON s.customer_id = c.id
  WHERE NOT EXISTS (SELECT 1 FROM public.staff st WHERE st.id = c.id)
    AND (
      c.phone_e164 IS NOT NULL
      OR COALESCE(s.order_count, 0) > 0
      OR (c.name IS NOT NULL AND length(trim(c.name)) > 0)
    )
  ORDER BY s.last_at DESC NULLS LAST, c.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
$$;

REVOKE ALL ON FUNCTION public.crm_list_customers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_customers(integer) TO authenticated;

COMMENT ON FUNCTION public.crm_list_customers(integer) IS
  'Admin CRM: customers excluding staff and empty login-only profiles; live order counts (non-cancelled).';
