-- v2: Staff read policies based on presence in `staff` table (not JWT claims).
-- This avoids relying on `app_metadata.role` being correctly set on the token.

-- Staff definition: `staff.id` references `auth.users(id)` and has `is_active`.

-- Orders: staff can read all orders
DROP POLICY IF EXISTS "orders_staff_read" ON orders;
CREATE POLICY "orders_staff_reavd" ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- Order items: staff can read all order items
DROP POLICY IF EXISTS "order_items_staff_read" ON order_items;
CREATE POLICY "order_items_staff_read" ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- Customers: staff can read customer details for operations
DROP POLICY IF EXISTS "customers_staff_read" ON customers;
CREATE POLICY "customers_staff_read" ON customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

