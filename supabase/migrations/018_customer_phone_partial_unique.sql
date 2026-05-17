-- Allow nullable phone for legacy-row reconciliation when linking auth.users.id to customers.
-- Partial unique index keeps phone unique among rows that have a number.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_e164_key;

ALTER TABLE customers
  ALTER COLUMN phone_e164 DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_e164_unique
  ON customers (phone_e164)
  WHERE phone_e164 IS NOT NULL;
