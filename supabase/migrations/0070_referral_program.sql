-- ============================================================
-- Customer Referral Program
-- ============================================================

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  max_uses        integer DEFAULT 50,
  current_uses    integer NOT NULL DEFAULT 0
);

-- Referral transactions table
CREATE TABLE IF NOT EXISTS referral_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_code_id uuid NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referrer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  reward_amount   numeric(10,2) NOT NULL DEFAULT 5.00,
  reward_type     text NOT NULL DEFAULT 'credit' CHECK (reward_type IN ('credit', 'discount', 'free_item')),
  is_claimed      boolean NOT NULL DEFAULT false,
  claimed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Referral rewards table
CREATE TABLE IF NOT EXISTS referral_rewards (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id  uuid NOT NULL REFERENCES referral_transactions(id) ON DELETE CASCADE,
  reward_amount   numeric(10,2) NOT NULL,
  reward_type     text NOT NULL,
  is_applied      boolean NOT NULL DEFAULT false,
  applied_at      timestamptz,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Add referral columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS referral_code text,
ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS referral_credits numeric(10,2) DEFAULT 0.00;

-- Indexes for performance
CREATE INDEX idx_referral_codes_customer_id ON referral_codes(customer_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_active ON referral_codes(is_active) WHERE is_active = true;
CREATE INDEX idx_referral_transactions_referrer ON referral_transactions(referrer_id);
CREATE INDEX idx_referral_transactions_referred ON referral_transactions(referred_id);
CREATE INDEX idx_referral_transactions_code ON referral_transactions(referral_code_id);
CREATE INDEX idx_referral_rewards_customer ON referral_rewards(customer_id);
CREATE INDEX idx_referral_rewards_applied ON referral_rewards(is_applied) WHERE is_applied = false;

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS generate_referral_code();
DROP FUNCTION IF EXISTS create_customer_referral_code(p_customer_id uuid);
DROP FUNCTION IF EXISTS process_referral(p_referral_code text, p_referred_id uuid, p_order_id uuid);
DROP FUNCTION IF EXISTS apply_referral_credits(p_customer_id uuid, p_order_id uuid, p_amount_to_apply numeric);
DROP FUNCTION IF EXISTS get_referral_stats(p_customer_id uuid);

-- Function to generate unique referral code
CREATE FUNCTION generate_referral_code()
RETURNS text AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := upper(substring(md5(random()::text), 1, 8));
    
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    
    IF NOT v_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to create referral code for customer
CREATE FUNCTION create_customer_referral_code(p_customer_id uuid)
RETURNS text AS $$
DECLARE
  v_code text;
BEGIN
  -- Check if customer already has a referral code
  SELECT code INTO v_code 
  FROM referral_codes 
  WHERE customer_id = p_customer_id AND is_active = true;
  
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;
  
  -- Generate new referral code
  v_code := generate_referral_code();
  
  INSERT INTO referral_codes (customer_id, code, expires_at)
  VALUES (p_customer_id, v_code, now() + interval '1 year');
  
  -- Update customer record
  UPDATE customers 
  SET referral_code = v_code 
  WHERE id = p_customer_id;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Function to process referral
CREATE FUNCTION process_referral(
  p_referral_code text,
  p_referred_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  reward_amount numeric
) AS $$
DECLARE
  v_referral referral_codes%ROWTYPE;
  v_referrer_id uuid;
  v_existing_referral referral_transactions%ROWTYPE;
  v_reward_amount numeric DEFAULT 5.00;
BEGIN
  -- Validate referral code
  SELECT * INTO v_referral
  FROM referral_codes 
  WHERE code = UPPER(p_referral_code) 
  AND is_active = true 
  AND (expires_at IS NULL OR expires_at > now())
  AND current_uses < max_uses;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid or expired referral code', 0::numeric;
    RETURN;
  END IF;
  
  v_referrer_id := v_referral.customer_id;
  
  -- Check if customer is trying to refer themselves
  IF v_referrer_id = p_referred_id THEN
    RETURN QUERY SELECT false, 'Cannot refer yourself', 0::numeric;
    RETURN;
  END IF;
  
  -- Check if this referral already exists
  SELECT * INTO v_existing_referral
  FROM referral_transactions 
  WHERE referral_code_id = v_referral.id 
  AND referred_id = p_referred_id;
  
  IF FOUND THEN
    RETURN QUERY SELECT false, 'Referral already used', 0::numeric;
    RETURN;
  END IF;
  
  -- Create referral transaction
  INSERT INTO referral_transactions (
    referral_code_id, referrer_id, referred_id, order_id, reward_amount
  ) VALUES (
    v_referral.id, v_referrer_id, p_referred_id, p_order_id, v_reward_amount
  );
  
  -- Update referral code usage
  UPDATE referral_codes 
  SET current_uses = current_uses + 1 
  WHERE id = v_referral.id;
  
  -- Update referred customer record
  UPDATE customers 
  SET referred_by = v_referrer_id 
  WHERE id = p_referred_id;
  
  -- Add reward to referrer
  UPDATE customers 
  SET referral_credits = referral_credits + v_reward_amount 
  WHERE id = v_referrer_id;
  
  -- Create reward record
  INSERT INTO referral_rewards (
    customer_id, transaction_id, reward_amount, reward_type
  ) VALUES (
    v_referrer_id, 
    (SELECT id FROM referral_transactions WHERE referral_code_id = v_referral.id AND referred_id = p_referred_id),
    v_reward_amount,
    'credit'
  );
  
  RETURN QUERY SELECT true, 'Referral processed successfully', v_reward_amount;
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to apply referral credits
CREATE FUNCTION apply_referral_credits(
  p_customer_id uuid,
  p_order_id uuid,
  p_amount_to_apply numeric
)
RETURNS numeric AS $$
DECLARE
  v_available_credits numeric;
  v_applied_amount numeric;
BEGIN
  -- Get available credits
  SELECT COALESCE(referral_credits, 0) INTO v_available_credits
  FROM customers 
  WHERE id = p_customer_id;
  
  -- Calculate amount to apply (don't exceed available credits)
  v_applied_amount := LEAST(p_amount_to_apply, v_available_credits);
  
  IF v_applied_amount > 0 THEN
    -- Update customer credits
    UPDATE customers 
    SET referral_credits = referral_credits - v_applied_amount 
    WHERE id = p_customer_id;
    
    -- Mark rewards as applied (using subquery to avoid ORDER BY in UPDATE)
    UPDATE referral_rewards 
    SET is_applied = true, applied_at = now(), order_id = p_order_id
    WHERE id IN (
      SELECT id 
      FROM referral_rewards 
      WHERE customer_id = p_customer_id 
      AND is_applied = false
      ORDER BY created_at ASC
      LIMIT CEIL(v_applied_amount / 5.0)
    );
  END IF;
  
  RETURN v_applied_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to get referral stats
CREATE FUNCTION get_referral_stats(p_customer_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_referrals bigint,
  active_referrals bigint,
  total_rewards numeric,
  pending_rewards numeric,
  referral_code text,
  referral_link text
) AS $$
BEGIN
  RETURN QUERY
  WITH referral_stats AS (
    SELECT 
      COUNT(*) as total_referrals,
      COUNT(CASE WHEN o.created_at >= now() - interval '30 days' THEN 1 END) as active_referrals,
      COALESCE(SUM(rt.reward_amount), 0) as total_rewards,
      COALESCE(SUM(CASE WHEN NOT rr.is_applied THEN rt.reward_amount ELSE 0 END), 0) as pending_rewards
    FROM referral_codes rc
    LEFT JOIN referral_transactions rt ON rc.id = rt.referral_code_id
    LEFT JOIN referral_rewards rr ON rt.id = rr.transaction_id
    LEFT JOIN orders o ON rt.referred_id = o.customer_id AND o.status = 'delivered'
    WHERE rc.customer_id = COALESCE(p_customer_id, rc.customer_id)
    AND rc.is_active = true
  )
  SELECT 
    rs.total_referrals,
    rs.active_referrals,
    rs.total_rewards,
    rs.pending_rewards,
    rc.code,
    'https://order.restaurant.qa?ref=' || rc.code as referral_link
  FROM referral_stats rs
  JOIN referral_codes rc ON rc.is_active = true 
    AND rc.customer_id = COALESCE(p_customer_id, rc.customer_id);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Customers can view their own referral codes
CREATE POLICY "Customers can view own referral codes" ON referral_codes
  FOR SELECT USING (auth.uid() = customer_id);

-- Customers can view their own referral transactions
CREATE POLICY "Customers can view own referral transactions" ON referral_transactions
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Customers can view their own referral rewards
CREATE POLICY "Customers can view own referral rewards" ON referral_rewards
  FOR SELECT USING (auth.uid() = customer_id);

-- Staff can manage all referral data
CREATE POLICY "Staff can manage referral data" ON referral_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Staff can manage referral transactions" ON referral_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Staff can manage referral rewards" ON referral_rewards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_referral_code TO authenticated;
GRANT EXECUTE ON FUNCTION create_customer_referral_code TO authenticated;
GRANT EXECUTE ON FUNCTION process_referral TO authenticated;
GRANT EXECUTE ON FUNCTION apply_referral_credits TO authenticated;
GRANT EXECUTE ON FUNCTION get_referral_stats TO authenticated;
