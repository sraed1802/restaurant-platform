-- Operator notifications: private config, realtime in-app events, and delivery logs.

INSERT INTO system_config (key, value, description)
VALUES (
  'operator_notifications',
  '{
    "email_enabled": false,
    "email_recipients": [],
    "telegram_enabled": false,
    "telegram_chat_ids": [],
    "notify_on_order_created": true,
    "notify_on_order_cancelled": true
  }'::jsonb,
  'Operator notification channel settings'
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS operator_notifications (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN ('order.created', 'order.cancelled')),
  audience_roles    text[] NOT NULL DEFAULT ARRAY['admin', 'manager']::text[],
  title             text NOT NULL,
  message           text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (
    audience_roles <@ ARRAY['admin', 'manager', 'supervisor']::text[]
    AND array_length(audience_roles, 1) IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS operator_notification_deliveries (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  notification_id   uuid REFERENCES operator_notifications(id) ON DELETE SET NULL,
  event_type        text NOT NULL CHECK (event_type IN ('order.created', 'order.cancelled')),
  channel           text NOT NULL CHECK (channel IN ('in_app', 'email', 'telegram')),
  recipient         text,
  status            text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  response_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operator_notification_secrets (
  key_name           text PRIMARY KEY,
  organization_id    uuid,
  cluster_id         uuid,
  property_id        uuid,
  ciphertext         text NOT NULL,
  iv                 text NOT NULL,
  key_version        int NOT NULL DEFAULT 1,
  updated_by         uuid REFERENCES staff(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (key_name IN ('telegram_bot_token'))
);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_order_id
  ON operator_notifications(order_id);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_created_at
  ON operator_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operator_notification_deliveries_order_id
  ON operator_notification_deliveries(order_id);

CREATE INDEX IF NOT EXISTS idx_operator_notification_deliveries_notification_id
  ON operator_notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_operator_notification_deliveries_status
  ON operator_notification_deliveries(channel, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_operator_notifications_updated_at ON operator_notifications;
CREATE TRIGGER trg_operator_notifications_updated_at
  BEFORE UPDATE ON operator_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_operator_notification_deliveries_updated_at ON operator_notification_deliveries;
CREATE TRIGGER trg_operator_notification_deliveries_updated_at
  BEFORE UPDATE ON operator_notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_operator_notification_secrets_updated_at ON operator_notification_secrets;
CREATE TRIGGER trg_operator_notification_secrets_updated_at
  BEFORE UPDATE ON operator_notification_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE operator_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_notification_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_notifications_staff_read" ON operator_notifications;
CREATE POLICY "operator_notifications_staff_read" ON operator_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
        AND s.app_role = ANY(operator_notifications.audience_roles)
    )
  );

DROP POLICY IF EXISTS "operator_notification_deliveries_staff_read" ON operator_notification_deliveries;
CREATE POLICY "operator_notification_deliveries_staff_read" ON operator_notification_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
        AND s.app_role IN ('admin', 'manager')
    )
  );

ALTER TABLE operator_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'operator_notifications'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_notifications';
    END IF;
  END IF;
END $$;
