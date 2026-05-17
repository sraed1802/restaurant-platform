-- CRM: enriched name/phone/email from auth metadata + orders; dedupe duplicate emails.

CREATE OR REPLACE FUNCTION public.auth_user_display_name(p_meta jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(
      COALESCE(
        p_meta ->> 'full_name',
        NULLIF(
          trim(concat_ws(' ', p_meta ->> 'first_name', p_meta ->> 'last_name')),
          ''
        ),
        p_meta ->> 'name'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_phone_e164(p_meta jsonb, p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_meta ->> 'phone_e164'), ''),
    NULLIF(trim(p_meta ->> 'phone'), '')
  );
$$;

-- Backfill customer profiles from auth metadata where missing.
UPDATE public.customers c
SET
  name = COALESCE(
    NULLIF(trim(c.name), ''),
    public.auth_user_display_name(u.raw_user_meta_data)
  ),
  phone_e164 = public.auth_user_phone_e164(u.raw_user_meta_data, c.phone_e164),
  email = COALESCE(NULLIF(trim(c.email), ''), NULLIF(trim(u.email), ''))
FROM auth.users u
WHERE c.id = u.id
  AND NOT public.is_non_customer_auth_user(u.id);

-- Guest names from hotel / delivery snapshots on orders.
UPDATE public.customers c
SET name = COALESCE(
  NULLIF(trim(c.name), ''),
  o.guest_name
)
FROM (
  SELECT
    o.customer_id,
    MAX(NULLIF(trim(o.delivery_address ->> 'guest_name'), '')) AS guest_name
  FROM public.orders o
  WHERE o.customer_id IS NOT NULL
    AND o.status IS DISTINCT FROM 'cancelled'
  GROUP BY o.customer_id
) o
WHERE c.id = o.customer_id
  AND o.guest_name IS NOT NULL;

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

  INSERT INTO public.customers (id, email, phone_e164, name, delivery_addresses, language_pref)
  VALUES (
    NEW.id,
    NEW.email,
    public.auth_user_phone_e164(NEW.raw_user_meta_data, NULL),
    public.auth_user_display_name(NEW.raw_user_meta_data),
    '[]'::jsonb,
    COALESCE(NEW.raw_user_meta_data ->> 'language_pref', 'en')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.customers.email),
    phone_e164 = COALESCE(public.customers.phone_e164, EXCLUDED.phone_e164),
    name = COALESCE(NULLIF(trim(public.customers.name), ''), EXCLUDED.name);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_customer_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  u record;
BEGIN
  IF uid IS NULL OR public.is_non_customer_auth_user(uid) THEN
    RETURN;
  END IF;

  SELECT id, email, raw_user_meta_data INTO u
  FROM auth.users
  WHERE id = uid;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.customers (id, email, phone_e164, name, delivery_addresses, language_pref)
  VALUES (
    u.id,
    u.email,
    public.auth_user_phone_e164(u.raw_user_meta_data, NULL),
    public.auth_user_display_name(u.raw_user_meta_data),
    '[]'::jsonb,
    COALESCE(u.raw_user_meta_data ->> 'language_pref', 'en')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.customers.email),
    phone_e164 = COALESCE(public.customers.phone_e164, EXCLUDED.phone_e164),
    name = COALESCE(NULLIF(trim(public.customers.name), ''), EXCLUDED.name);
END;
$$;

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
  marketing_opt_out boolean,
  is_registered boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stats AS (
    SELECT
      o.customer_id AS customer_id,
      COUNT(*)::integer AS order_count,
      MAX(o.created_at) AS last_at
    FROM public.orders o
    WHERE o.customer_id IS NOT NULL
      AND o.status IS DISTINCT FROM 'cancelled'
    GROUP BY o.customer_id
  ),
  order_names AS (
    SELECT
      o.customer_id,
      MAX(NULLIF(trim(o.delivery_address ->> 'guest_name'), '')) AS guest_name
    FROM public.orders o
    WHERE o.customer_id IS NOT NULL
      AND o.status IS DISTINCT FROM 'cancelled'
    GROUP BY o.customer_id
  ),
  enriched AS (
    SELECT
      c.id,
      COALESCE(
        NULLIF(trim(c.name), ''),
        public.auth_user_display_name(u.raw_user_meta_data),
        onm.guest_name
      ) AS name,
      public.auth_user_phone_e164(u.raw_user_meta_data, c.phone_e164) AS phone_e164,
      COALESCE(NULLIF(trim(c.email), ''), NULLIF(trim(u.email), '')) AS email,
      COALESCE(s.order_count, 0) AS total_orders,
      s.last_at AS last_order_at,
      c.created_at,
      COALESCE(c.marketing_opt_out, false) AS marketing_opt_out,
      (u.id IS NOT NULL) AS is_registered
    FROM public.customers c
    LEFT JOIN auth.users u ON u.id = c.id
    LEFT JOIN stats s ON s.customer_id = c.id
    LEFT JOIN order_names onm ON onm.customer_id = c.id
    WHERE NOT EXISTS (SELECT 1 FROM public.staff st WHERE st.id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.drivers dr WHERE dr.auth_user_id = c.id)
      AND (
        public.auth_user_phone_e164(u.raw_user_meta_data, c.phone_e164) IS NOT NULL
        OR COALESCE(s.order_count, 0) > 0
        OR COALESCE(
          NULLIF(trim(c.name), ''),
          public.auth_user_display_name(u.raw_user_meta_data),
          onm.guest_name
        ) IS NOT NULL
        OR COALESCE(NULLIF(trim(c.email), ''), NULLIF(trim(u.email), '')) IS NOT NULL
      )
  ),
  ranked AS (
    SELECT
      e.*,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(e.email))
        ORDER BY
          e.total_orders DESC,
          (e.phone_e164 IS NOT NULL) DESC,
          (e.name IS NOT NULL) DESC,
          e.is_registered DESC,
          e.created_at DESC
      ) AS email_rank
    FROM enriched e
    WHERE e.email IS NOT NULL AND length(trim(e.email)) > 0
  ),
  combined AS (
    SELECT
      id, name, email, phone_e164, total_orders, last_order_at, created_at, marketing_opt_out, is_registered
    FROM ranked
    WHERE email_rank = 1
    UNION ALL
    SELECT
      id, name, email, phone_e164, total_orders, last_order_at, created_at, marketing_opt_out, is_registered
    FROM enriched
    WHERE email IS NULL OR length(trim(email)) = 0
  )
  SELECT
    id, name, email, phone_e164, total_orders, last_order_at, created_at, marketing_opt_out, is_registered
  FROM combined
  ORDER BY COALESCE(last_order_at, created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
$$;

REVOKE ALL ON FUNCTION public.crm_list_customers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_customers(integer) TO authenticated;

COMMENT ON FUNCTION public.crm_list_customers(integer) IS
  'Admin CRM: enriched customer rows (auth metadata, order guest names), email dedupe, excludes staff/drivers.';
