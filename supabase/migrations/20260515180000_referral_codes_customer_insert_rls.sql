-- create_customer_referral_code runs as SECURITY INVOKER; without INSERT policy,
-- authenticated customers cannot insert their own row into referral_codes.
DROP POLICY IF EXISTS "Customers can insert own referral codes" ON referral_codes;
CREATE POLICY "Customers can insert own referral codes" ON referral_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);
