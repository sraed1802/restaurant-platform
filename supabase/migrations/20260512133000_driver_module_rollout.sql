-- Driver module rollout: auth-linked drivers, notification inbox, and lifecycle policies.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS login_email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE drivers
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'drivers_active_order_id_fkey'
  ) THEN
    ALTER TABLE drivers
      ADD CONSTRAINT drivers_active_order_id_fkey
      FOREIGN KEY (active_order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_drivers_active_order_id
  ON drivers(active_order_id);

CREATE INDEX IF NOT EXISTS idx_drivers_tenant_scope
  ON drivers(organization_id, cluster_id, property_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_auth_user_id_unique
  ON drivers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_login_email_unique
  ON drivers(login_email)
  WHERE login_email IS NOT NULL;

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers;
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE order_events
  DROP CONSTRAINT IF EXISTS order_events_actor_role_check;

ALTER TABLE order_events
  ADD CONSTRAINT order_events_actor_role_check
  CHECK (actor_role IN ('customer', 'driver', 'admin', 'manager', 'supervisor', 'system'));

CREATE TABLE IF NOT EXISTS driver_notifications (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  driver_id         uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN ('order.assigned', 'order.cancelled', 'order.updated', 'order.cash_collected')),
  title             text NOT NULL,
  message           text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_driver_id
  ON driver_notifications(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_order_id
  ON driver_notifications(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_notifications_tenant_scope
  ON driver_notifications(organization_id, cluster_id, property_id);

DROP TRIGGER IF EXISTS trg_driver_notifications_updated_at ON driver_notifications;
CREATE TRIGGER trg_driver_notifications_updated_at
  BEFORE UPDATE ON driver_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE driver_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_notifications REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "drivers_self_read" ON drivers;
CREATE POLICY "drivers_self_read" ON drivers
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    AND is_active = true
  );

DROP POLICY IF EXISTS "drivers_customer_tracking_read" ON drivers;
CREATE POLICY "drivers_customer_tracking_read" ON drivers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.driver_id = drivers.id
        AND o.customer_id = auth.uid()
        AND o.status IN ('dispatched', 'delivered')
    )
  );

DROP POLICY IF EXISTS "driver_notifications_driver_read" ON driver_notifications;
CREATE POLICY "driver_notifications_driver_read" ON driver_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.id = driver_notifications.driver_id
        AND d.auth_user_id = auth.uid()
        AND d.is_active = true
    )
  );

DROP POLICY IF EXISTS "driver_notifications_driver_update" ON driver_notifications;
CREATE POLICY "driver_notifications_driver_update" ON driver_notifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.id = driver_notifications.driver_id
        AND d.auth_user_id = auth.uid()
        AND d.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.id = driver_notifications.driver_id
        AND d.auth_user_id = auth.uid()
        AND d.is_active = true
    )
  );

DROP POLICY IF EXISTS "driver_notifications_staff_read" ON driver_notifications;
CREATE POLICY "driver_notifications_staff_read" ON driver_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'driver_notifications'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications';
    END IF;
  END IF;
END $$;
