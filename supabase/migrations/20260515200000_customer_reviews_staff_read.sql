-- Staff can read all customer reviews in the admin app.
DROP POLICY IF EXISTS customer_reviews_staff_read ON public.customer_reviews;
CREATE POLICY customer_reviews_staff_read ON public.customer_reviews
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'supervisor')
  );
