-- ============================================================
-- Add Time Range Fields to Promotions (Safe Version)
-- ============================================================

-- Check if columns exist before adding them
DO $$
BEGIN
    -- Check if valid_from_time column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'promotions' 
        AND column_name = 'valid_from_time'
    ) THEN
        -- Add valid_from_time column
        ALTER TABLE promotions ADD COLUMN valid_from_time time;
    END IF;

    -- Check if valid_until_time column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'promotions' 
        AND column_name = 'valid_until_time'
    ) THEN
        -- Add valid_until_time column
        ALTER TABLE promotions ADD COLUMN valid_until_time time;
    END IF;

    -- Update existing promotions to have default time values
    UPDATE promotions 
    SET valid_from_time = '00:00:00', 
        valid_until_time = '23:59:59'
    WHERE valid_from_time IS NULL OR valid_until_time IS NULL;
END $$;

-- Add index for time-based queries
CREATE INDEX IF NOT EXISTS idx_promotions_time_range ON promotions(is_active, valid_from, valid_until, valid_from_time, valid_until_time)
WHERE is_active = true;
