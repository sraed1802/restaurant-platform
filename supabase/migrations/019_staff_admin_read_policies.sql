-- Allow staff roles to read orders and customer profiles in Admin app.
-- NOTE: Uses `auth.jwt()` app_metadata.role claims set by your staff provisioning flow.

-- Orders: staff can read all orders
DROP POLICY IF EXISTS "orders_staff_read" ON orders;
CREATE POLICY "orders_staff_read" ON orders
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );

-- Order items: staff can read all order items
DROP POLICY IF EXISTS "order_items_staff_read" ON order_items;
CREATE POLICY "order_items_staff_read" ON order_items
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );

-- Customers: staff can read customer details (name/phone/email) for orders list
DROP POLICY IF EXISTS "customers_staff_read" ON customers;
CREATE POLICY "customers_staff_read" ON customers
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );

