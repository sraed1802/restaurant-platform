-- ============================================================
-- Add Free Delivery Configuration
-- ============================================================

-- Add free delivery toggle to system config
INSERT INTO system_config (key, value, description) VALUES 
('free_delivery_enabled', 'false', 'Enable free delivery for all orders'),
('free_delivery_min_order', '0.000', 'Minimum order value for free delivery');

-- Update existing delivery_fee to be more descriptive
UPDATE system_config 
SET description = 'Standard delivery fee when not free'
WHERE key = 'delivery_fee';
