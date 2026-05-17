-- Phase 1 foundation: extend payment storage for Stripe retries, sessions, and webhook processing
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  ADD COLUMN IF NOT EXISTS provider_session_id text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS webhook_event_id text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_provider_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_provider_check
  CHECK (payment_provider IN ('qpay', 'stripe', 'dokhan', 'other'));

DROP INDEX IF EXISTS idx_payments_order_id;
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_attempt
  ON payments(order_id, attempt_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_session_id
  ON payments(provider_session_id)
  WHERE provider_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_webhook_event_id
  ON payments(webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_scope
  ON payments(organization_id, cluster_id, property_id);

DROP TRIGGER IF EXISTS set_payments_updated_at ON payments;
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_staff_read" ON payments;
CREATE POLICY "payments_staff_read" ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id       uuid REFERENCES payments(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('qpay', 'stripe', 'other')),
  event_id         text NOT NULL,
  event_type       text NOT NULL,
  livemode         boolean NOT NULL DEFAULT false,
  processed_at     timestamptz,
  processing_error text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  organization_id  uuid,
  cluster_id       uuid,
  property_id      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_event
  ON payment_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id
  ON payment_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_id
  ON payment_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_scope
  ON payment_webhook_events(organization_id, cluster_id, property_id);

ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_webhook_events_staff_read" ON payment_webhook_events;
CREATE POLICY "payment_webhook_events_staff_read" ON payment_webhook_events
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

DROP TRIGGER IF EXISTS set_payment_webhook_events_updated_at ON payment_webhook_events;
CREATE TRIGGER set_payment_webhook_events_updated_at
  BEFORE UPDATE ON payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
