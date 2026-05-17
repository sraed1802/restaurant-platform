-- ============================================================
-- Promotion Enhancements Migration
-- ============================================================

-- Add promotion_categories table
CREATE TABLE promotion_categories (
  promotion_id  uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, category_id)
);

-- Add is_featured and condition_type to promotions
ALTER TABLE promotions
  ADD COLUMN is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN condition_type text NOT NULL DEFAULT 'none'
  CHECK (condition_type IN ('none', 'first_order', 'min_order', 'specific_products', 'specific_categories'));

-- Update conditions JSONB structure to support new condition types
-- The conditions field will store:
-- - For 'first_order': {}
-- - For 'min_order': { "min_value": number }
-- - For 'specific_products': { "product_ids": uuid[] }
-- - For 'specific_categories': { "category_ids": uuid[] }

-- Enable RLS
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;

-- Policies for promotion_categories
CREATE POLICY "promotion_categories_service_all" ON promotion_categories
  FOR ALL TO service_role USING (true);

CREATE POLICY "promotion_categories_no_client_access" ON promotion_categories
  FOR ALL TO anon, authenticated USING (false);

-- Index for faster queries
CREATE INDEX idx_promotions_featured ON promotions(is_featured, is_active) 
  WHERE is_active = true AND is_featured = true;

CREATE INDEX idx_promotions_condition_type ON promotions(condition_type, is_active)
  WHERE is_active = true;

CREATE INDEX idx_promotion_categories_category ON promotion_categories(category_id);
