-- Add sample promotion-product relationships
-- This migration links existing promotions to products for testing

-- First, let's see what products we have and link some popular items to promotions
-- We'll link the first few products to the existing promotions

-- Link some products to promotions (assuming we have at least some products)
-- This is sample data - in production, this would be managed through the admin interface

INSERT INTO promotion_products (promotion_id, product_id)
SELECT 
  p.id as promotion_id,
  prod.id as product_id
FROM promotions p
CROSS JOIN LATERAL (
  SELECT id FROM products 
  WHERE is_available = true 
  ORDER BY display_order 
  LIMIT 3
) prod
WHERE p.is_active = true
  AND p.code IS NOT NULL  -- Only link to promotions that have codes
ON CONFLICT (promotion_id, product_id) DO NOTHING;

-- Also link some products to automatic promotions
INSERT INTO promotion_products (promotion_id, product_id)
SELECT 
  p.id as promotion_id,
  prod.id as product_id
FROM promotions p
CROSS JOIN LATERAL (
  SELECT id FROM products 
  WHERE is_available = true 
  ORDER BY display_order 
  OFFSET 3 LIMIT 2
) prod
WHERE p.is_active = true
  AND p.type = 'automatic'
ON CONFLICT (promotion_id, product_id) DO NOTHING;
