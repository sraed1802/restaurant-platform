-- ============================================================
-- Add Time Range Fields to Promotions
-- ============================================================

-- Add time fields to promotions for daily time-based promotions
ALTER TABLE promotions
  ADD COLUMN valid_from_time time,
  ADD COLUMN valid_until_time time;

-- Update existing promotions to have default time values
UPDATE promotions 
SET valid_from_time = '00:00:00', 
    valid_until_time = '23:59:59'
WHERE valid_from_time IS NULL;

-- Add index for time-based queries
CREATE INDEX idx_promotions_time_range ON promotions(is_active, valid_from, valid_until, valid_from_time, valid_until_time)
WHERE is_active = true;
