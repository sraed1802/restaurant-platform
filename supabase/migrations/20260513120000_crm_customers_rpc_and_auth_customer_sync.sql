-- CRM: live order counts (non-cancelled) so guest + in-flight orders show correctly.
-- Auth: ensure every auth.users row gets a matching public.customers profile for admin CRM.

-- ---------------------------------------------------------------------------
-- 1) New signups → customers row (id = auth user id; phone filled at checkout)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customers (id, email, phone_e164, delivery_addresses, language_pref)
  VALUES (NEW.id, NEW.email, NULL, '[]'::jsonb, 'en')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;
CREATE TRIGGER on_auth_user_created_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill existing auth users missing a customer row (email sign-in / OTP, etc.)
INSERT INTO public.customers (id, email, phone_e164, delivery_addresses, language_pref)
SELECT u.id, u.email, NULL, '[]'::jsonb, 'en'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Staff CRM list: aggregate orders excluding cancelled
-- ---------------------------------------------------------------------------
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
  ORDER BY s.last_at DESC NULLS LAST, c.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
$$;

REVOKE ALL ON FUNCTION public.crm_list_customers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_customers(integer) TO authenticated;

COMMENT ON FUNCTION public.crm_list_customers(integer) IS
  'Admin CRM: customers with live order counts (excludes cancelled). SECURITY INVOKER respects staff RLS.';
