INSERT INTO system_config (key, value, description)
VALUES (
  'payment_gateway_settings',
  '{
    "stripe_enabled": false,
    "stripe_mode": "test",
    "checkout_label": "Pay online with Stripe"
  }'::jsonb,
  'Stripe checkout runtime settings for guest ordering'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value || system_config.value,
  description = EXCLUDED.description;
