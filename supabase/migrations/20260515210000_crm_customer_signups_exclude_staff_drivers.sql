-- CRM: show real customer signups (including email-only before first order).
-- Exclude staff and driver portal accounts from public.customers mirror + CRM list.

-- Remove mistaken customer rows for drivers (staff cleanup was in 20260514120000).
DELETE FROM public.customers c
USING public.drivers d
WHERE c.id = d.auth_user_id;

CREATE OR REPLACE FUNCTION public.is_non_customer_auth_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.auth_user_id = p_user_id)
    OR lower(coalesce(
      (SELECT raw_app_meta_data ->> 'role' FROM auth.users u WHERE u.id = p_user_id),
      ''
    )) IN ('admin', 'manager', 'supervisor', 'driver');
$$;

REVOKE ALL ON FUNCTION public.is_non_customer_auth_user(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_non_customer_auth_user(NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customers (id, email, phone_e164, delivery_addresses, language_pref)
  VALUES (NEW.id, NEW.email, NULL, '[]'::jsonb, 'en')
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.customers.email);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;
CREATE TRIGGER on_auth_user_created_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill customer profiles for existing auth users (not staff / drivers).
INSERT INTO public.customers (id, email, phone_e164, delivery_addresses, language_pref)
SELECT u.id, u.email, NULL, '[]'::jsonb, 'en'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = u.id)
  AND NOT public.is_non_customer_auth_user(u.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_customer_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR public.is_non_customer_auth_user(uid) THEN
    RETURN;
  END IF;

  INSERT INTO public.customers (id, email, phone_e164, delivery_addresses, language_pref)
  SELECT uid, u.email, NULL, '[]'::jsonb, 'en'
  FROM auth.users u
  WHERE u.id = uid
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.customers.email);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_customer_profile() TO authenticated;

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
    AND NOT EXISTS (SELECT 1 FROM public.drivers dr WHERE dr.auth_user_id = c.id)
    AND (
      c.phone_e164 IS NOT NULL
      OR COALESCE(s.order_count, 0) > 0
      OR (c.name IS NOT NULL AND length(trim(c.name)) > 0)
      OR (c.email IS NOT NULL AND length(trim(c.email)) > 0)
    )
  ORDER BY COALESCE(s.last_at, c.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
$$;

REVOKE ALL ON FUNCTION public.crm_list_customers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_customers(integer) TO authenticated;

COMMENT ON FUNCTION public.crm_list_customers(integer) IS
  'Admin CRM: customers excluding staff/drivers; includes email signups before first order.';
