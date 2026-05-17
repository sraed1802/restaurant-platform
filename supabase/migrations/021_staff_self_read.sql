-- Allow a staff user to read their own `staff` row.
-- Needed for RLS policies on other tables that check staff membership via EXISTS.

DROP POLICY IF EXISTS "staff_self_read" ON staff;
CREATE POLICY "staff_self_read" ON staff
  FOR SELECT TO authenticated
  USING (id = auth.uid());

