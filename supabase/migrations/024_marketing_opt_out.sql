-- Customer marketing preferences (unsubscribe)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_marketing_opt_out ON customers(marketing_opt_out);

