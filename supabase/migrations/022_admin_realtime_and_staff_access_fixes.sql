-- Fix staff read policy typo and enable realtime for orders.

-- 1) Fix typo from 020 migration ("orders_staff_reavd" should be "orders_staff_read")
DROP POLICY IF EXISTS "orders_staff_reavd" ON orders;
DROP POLICY IF EXISTS "orders_staff_read" ON orders;
CREATE POLICY "orders_staff_read" ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- 2) Allow staff to read drivers (admin UI embeds drivers on orders)
DROP POLICY IF EXISTS "drivers_staff_read" ON drivers;
CREATE POLICY "drivers_staff_read" ON drivers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

-- 3) Realtime: ensure updates stream to admin without manual refresh
-- This is safe to run multiple times.
ALTER TABLE orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Add to realtime publication if it exists (hosted Supabase uses `supabase_realtime`)
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
    END IF;
  END IF;
END $$;

