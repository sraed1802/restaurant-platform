-- Fix RLS policies to allow anon access to promotion_products and promotion_categories
-- This fixes the issue where customer app cannot access promotional data

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_products" ON promotion_products;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_products" ON promotion_products;

DROP POLICY IF EXISTS "Enable read access for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable update for authenticated users on promotion_categories" ON promotion_categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users on promotion_categories" ON promotion_categories;

-- Create new policies that allow both anon and authenticated access for reading
CREATE POLICY "Enable read access for all users on promotion_products"
ON promotion_products
FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

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

-- Create new policies for promotion_categories
CREATE POLICY "Enable read access for all users on promotion_categories"
ON promotion_categories
FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));

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

-- Ensure RLS is enabled
ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT SELECT ON promotion_products TO anon;
GRANT SELECT ON promotion_categories TO anon;
GRANT ALL ON promotion_products TO authenticated;
GRANT ALL ON promotion_categories TO authenticated;
