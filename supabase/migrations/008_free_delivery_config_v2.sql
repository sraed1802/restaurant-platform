-- ============================================================
-- Add Free Delivery Configuration (Safe Version)
-- ============================================================

-- Check if config exists before inserting
DO $$
BEGIN
    -- Check if free_delivery_enabled already exists
    IF EXISTS (
        SELECT 1 FROM system_config 
        WHERE key = 'free_delivery_enabled'
    ) THEN
        -- Update existing value
        UPDATE system_config 
        SET value = 'false'
        WHERE key = 'free_delivery_enabled';
    ELSE
        -- Insert new value
        INSERT INTO system_config (key, value, description) VALUES 
        ('free_delivery_enabled', 'false', 'Enable free delivery for all orders');
    END IF;

    -- Check if free_delivery_min_order already exists
    IF EXISTS (
        SELECT 1 FROM system_config 
        WHERE key = 'free_delivery_min_order'
    ) THEN
        -- Update existing value
        UPDATE system_config 
        SET value = '0.000'
        WHERE key = 'free_delivery_min_order';
    ELSE
        -- Insert new value
        INSERT INTO system_config (key, value, description) VALUES 
        ('free_delivery_min_order', '0.000', 'Minimum order value for free delivery');
    END IF;

    -- Update existing delivery_fee description
    UPDATE system_config 
    SET description = 'Standard delivery fee when not free'
    WHERE key = 'delivery_fee';
END $$;
