-- Fix RLS policies for promotion_categories and related tables
-- This migration fixes the 403 Forbidden error on promotion_categories endpoint

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_categories" ON promotion_categories;

DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_products" ON promotion_products;

-- Create new RLS policies for promotion_categories
CREATE POLICY "Enable read access for authenticated users on promotion_categories"
ON promotion_categories
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on promotion_categories"
ON promotion_categories
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_categories"
ON promotion_categories
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_categories"
ON promotion_categories
FOR DELETE USING (auth.role() = 'authenticated');

-- Create new RLS policies for promotion_products
CREATE POLICY "Enable read access for authenticated users on promotion_products"
ON promotion_products
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users on promotion_products"
ON promotion_products
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users on promotion_products"
ON promotion_products
FOR UPDATE USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users on promotion_products"
ON promotion_products
FOR DELETE USING (auth.role() = 'authenticated');

-- Ensure RLS is enabled on these tables
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON promotion_categories TO authenticated;
GRANT ALL ON promotion_products TO authenticated;
GRANT SELECT ON promotion_categories TO anon;
GRANT SELECT ON promotion_products TO anon;
