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
