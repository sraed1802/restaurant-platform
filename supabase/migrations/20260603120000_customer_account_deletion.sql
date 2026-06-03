-- Self-service customer account deletion (GDPR-style erasure of guest PII).
-- Orders are retained for operations/accounting; delivery snapshots are redacted.

CREATE OR REPLACE FUNCTION public.purge_customer_pii(p_user_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := p_user_id;
BEGIN
  IF v_uid IS NULL OR v_uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF public.is_non_customer_auth_user(v_uid) THEN
    RAISE EXCEPTION 'not_a_customer_account' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
  SET
    customer_id = NULL,
    delivery_address = jsonb_build_object(
      'redacted', true,
      'redacted_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    special_instructions = NULL
  WHERE customer_id = v_uid;

  UPDATE public.analytics_events
  SET customer_id = NULL
  WHERE customer_id = v_uid;

  DELETE FROM public.customers
  WHERE id = v_uid;

  INSERT INTO public.audit_logs (action, actor_id, actor_role, entity_type, entity_id, metadata)
  VALUES (
    'customer_account_deleted',
    v_uid,
    'customer',
    'customer',
    v_uid,
    jsonb_build_object('self_service', true, 'orders_redacted', true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_customer_pii(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_customer_pii(uuid) TO authenticated;

COMMENT ON FUNCTION public.purge_customer_pii(uuid) IS
  'Authenticated customer: redact order PII, remove customers row. Auth user must be deleted via delete-customer-account edge function.';
