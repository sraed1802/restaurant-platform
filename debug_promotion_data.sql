-- Debug query to check promotion_products data
-- Run this in Supabase SQL editor to verify data exists

-- Check if promotion_products table has any data
SELECT COUNT(*) as total_records FROM promotion_products;

-- Check specific promotion that admin shows has products
SELECT * FROM promotion_products 
WHERE promotion_id = '2913e37a-1610-4bcd-8ded-ce2caf8f4475';

-- Check all promotion_products for our active promotions
SELECT pp.product_id, pp.promotion_id, p.name_en as promotion_name
FROM promotion_products pp
JOIN promotions p ON pp.promotion_id = p.id
WHERE pp.promotion_id IN (
  '9b60d3b2-cf5e-44c7-89e0-427b8be1242d', 
  'b2de862c-8c36-43ab-b781-ce5ea3bcb1f7', 
  '2634972d-c17d-4d82-8f7a-36a3ae06c855', 
  '6d61ff18-3974-4ffd-8056-c0e8d02d5678', 
  '2913e37a-1610-4bcd-8ded-ce2caf8f4475'
);

-- Test RLS policy for anon role
SET ROLE anon;
SELECT COUNT(*) as anon_count FROM promotion_products;
RESET ROLE;
