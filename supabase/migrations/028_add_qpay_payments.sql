-- Add payments table for QPay / Dokhan / additional payment gateway transactions
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_provider text NOT NULL DEFAULT 'qpay'
    CHECK (payment_provider IN ('qpay', 'dokhan', 'other')),
  provider_transaction_id text,
  provider_payment_reference text,
  amount numeric(10,3) NOT NULL,
  currency text NOT NULL DEFAULT 'QAR',
  payment_method text NOT NULL DEFAULT 'online'
    CHECK (payment_method IN ('cash', 'card', 'online')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled')),
  provider_response jsonb,
  failure_code text,
  failure_message text,
  captured_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_transaction_id
  ON payments(provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(payment_provider);
