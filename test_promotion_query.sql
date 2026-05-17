-- Test query to debug promotion_products access
-- Run this in Supabase SQL editor to check if anon role can access promotion_products

-- Test 1: Check if data exists
SELECT COUNT(*) as total_promotion_products FROM promotion_products;

-- Test 2: Test the exact query the app is using
SELECT product_id 
FROM promotion_products 
WHERE promotion_id IN (
  SELECT id FROM promotions 
  WHERE is_active = true 
    AND (valid_until IS NULL OR valid_until > NOW())
    AND valid_from <= NOW()
);

-- Test 3: Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'promotion_products';

-- Test 4: Check if anon role has access
SELECT has_table_privilege('anon', 'promotion_products', 'SELECT') as anon_can_select;
