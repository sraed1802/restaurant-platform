-- ============================================================
-- Comprehensive Fix for All Configuration Issues
-- ============================================================

-- Reset all configurations to proper defaults
DELETE FROM system_config WHERE key IN ('delivery_fee', 'free_delivery_enabled', 'free_delivery_min_order');

-- Insert correct configuration values
INSERT INTO system_config (key, value, description) VALUES 
('delivery_fee', '1.000', 'Standard delivery fee when not free'),
('free_delivery_enabled', 'false', 'Enable free delivery for all orders'),
('free_delivery_min_order', '0.000', 'Minimum order value for free delivery');

-- Reset promotion time fields to defaults for existing records
UPDATE promotions 
SET valid_from_time = '00:00:00', 
    valid_until_time = '23:59:59'
WHERE valid_from_time IS NULL OR valid_until_time IS NULL;

-- Ensure proper indexes exist
DROP INDEX IF EXISTS idx_promotions_time_range;
CREATE INDEX idx_promotions_time_range ON promotions(is_active, valid_from, valid_until, valid_from_time, valid_until_time)
WHERE is_active = true;
