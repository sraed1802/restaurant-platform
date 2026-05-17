-- Expand in-app operator alerts, driver dispatch events, driver GPS updates, and realtime.

ALTER TABLE public.operator_notifications
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.operator_notifications
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_operator_notifications_driver_id
  ON public.operator_notifications(driver_id);

ALTER TABLE public.operator_notifications
  DROP CONSTRAINT IF EXISTS operator_notifications_event_type_check;

ALTER TABLE public.operator_notifications
  ADD CONSTRAINT operator_notifications_event_type_check
  CHECK (
    event_type IN (
      'order.created',
      'order.cancelled',
      'order.status_updated',
      'driver.assignment_accepted',
      'driver.cash_collected',
      'driver.delivered',
      'driver.status_changed'
    )
  );

ALTER TABLE public.operator_notification_deliveries
  DROP CONSTRAINT IF EXISTS operator_notification_deliveries_event_type_check;

ALTER TABLE public.operator_notification_deliveries
  ADD CONSTRAINT operator_notification_deliveries_event_type_check
  CHECK (
    event_type IN (
      'order.created',
      'order.cancelled',
      'order.status_updated',
      'driver.assignment_accepted',
      'driver.cash_collected',
      'driver.delivered',
      'driver.status_changed'
    )
  );

ALTER TABLE public.driver_notifications
  DROP CONSTRAINT IF EXISTS driver_notifications_event_type_check;

ALTER TABLE public.driver_notifications
  ADD CONSTRAINT driver_notifications_event_type_check
  CHECK (
    event_type IN (
      'order.assigned',
      'order.cancelled',
      'order.updated',
      'order.ready_for_dispatch',
      'order.cash_collected'
    )
  );

-- Drivers may publish GPS while authenticated.
DROP POLICY IF EXISTS drivers_self_update_location ON public.drivers;
CREATE POLICY drivers_self_update_location ON public.drivers
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() AND is_active = true)
  WITH CHECK (auth_user_id = auth.uid() AND is_active = true);

ALTER TABLE public.drivers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'drivers'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers';
    END IF;
  END IF;
END $$;
