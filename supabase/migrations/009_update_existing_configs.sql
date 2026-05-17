-- ============================================================
-- Update Existing Configuration Values
-- ============================================================

-- Update delivery fee to match admin panel setting
UPDATE system_config 
SET value = '1.000'
WHERE key = 'delivery_fee' AND value != '1.000';

-- Ensure free delivery is disabled (will be enabled manually if needed)
UPDATE system_config 
SET value = 'false'
WHERE key = 'free_delivery_enabled' AND value != 'false';
