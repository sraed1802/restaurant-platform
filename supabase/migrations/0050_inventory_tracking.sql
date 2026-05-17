-- ============================================================
-- Inventory Tracking System
-- ============================================================

-- Add inventory columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS stock_unit text DEFAULT 'pieces',
ADD COLUMN IF NOT EXISTS last_stock_update timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_stock_tracked boolean NOT NULL DEFAULT false;

-- Inventory transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'adjustment', 'waste', 'return')),
  quantity_change integer NOT NULL, -- positive for additions, negative for subtractions
  quantity_before integer NOT NULL,
  quantity_after  integer NOT NULL,
  reason          text,
  staff_id        uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  notes           text
);

-- Low stock alerts table
CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock   integer NOT NULL,
  threshold       integer NOT NULL,
  is_resolved     boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Inventory snapshots for historical tracking
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_level     integer NOT NULL,
  snapshot_date   date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, snapshot_date)
);

-- Indexes for performance
CREATE INDEX idx_inventory_transactions_product_id ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_created_at ON inventory_transactions(created_at DESC);
CREATE INDEX idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_low_stock_alerts_product_id ON low_stock_alerts(product_id);
CREATE INDEX idx_low_stock_alerts_resolved ON low_stock_alerts(is_resolved);
CREATE INDEX idx_inventory_snapshots_product_id ON inventory_snapshots(product_id);
CREATE INDEX idx_inventory_snapshots_date ON inventory_snapshots(snapshot_date DESC);

-- Function to create daily inventory snapshots
CREATE OR REPLACE FUNCTION create_daily_inventory_snapshots()
RETURNS void AS $$
BEGIN
  INSERT INTO inventory_snapshots (product_id, stock_level, snapshot_date)
  SELECT 
    id, 
    stock_level, 
    CURRENT_DATE
  FROM products 
  WHERE is_stock_tracked = true
  ON CONFLICT (product_id, snapshot_date) 
  DO UPDATE SET 
    stock_level = EXCLUDED.stock_level,
    created_at = now();
END;
$$ LANGUAGE plpgsql;

-- Schedule daily snapshot creation
SELECT cron.schedule('daily-inventory-snapshots', '0 1 * * *', 'SELECT create_daily_inventory_snapshots()');

-- Function to update stock and create transaction
CREATE OR REPLACE FUNCTION update_product_stock(
  p_product_id uuid,
  p_quantity_change integer,
  p_transaction_type text,
  p_reason text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_current_stock integer;
  v_new_stock integer;
BEGIN
  -- Get current stock
  SELECT stock_level INTO v_current_stock
  FROM products
  WHERE id = p_product_id AND is_stock_tracked = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or stock tracking not enabled';
  END IF;
  
  -- Calculate new stock
  v_new_stock := v_current_stock + p_quantity_change;
  
  -- Validate stock doesn't go negative (except for adjustments)
  IF v_new_stock < 0 AND p_transaction_type != 'adjustment' THEN
    RAISE EXCEPTION 'Insufficient stock for this transaction';
  END IF;
  
  -- Update product stock
  UPDATE products
  SET 
    stock_level = v_new_stock,
    last_stock_update = now()
  WHERE id = p_product_id;
  
  -- Create transaction record
  INSERT INTO inventory_transactions (
    product_id,
    transaction_type,
    quantity_change,
    quantity_before,
    quantity_after,
    reason,
    staff_id,
    notes
  ) VALUES (
    p_product_id,
    p_transaction_type,
    p_quantity_change,
    v_current_stock,
    v_new_stock,
    p_reason,
    p_staff_id,
    p_notes
  );
  
  -- Check for low stock alert
  IF v_new_stock <= (SELECT low_stock_threshold FROM products WHERE id = p_product_id) THEN
    INSERT INTO low_stock_alerts (product_id, current_stock, threshold)
    VALUES (
      p_product_id,
      v_new_stock,
      (SELECT low_stock_threshold FROM products WHERE id = p_product_id)
    )
    ON CONFLICT (product_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check and create low stock alerts
CREATE OR REPLACE FUNCTION check_low_stock_alerts()
RETURNS void AS $$
BEGIN
  INSERT INTO low_stock_alerts (product_id, current_stock, threshold)
  SELECT 
    id,
    stock_level,
    low_stock_threshold
  FROM products
  WHERE 
    is_stock_tracked = true 
    AND stock_level <= low_stock_threshold
    AND id NOT IN (
      SELECT product_id FROM low_stock_alerts WHERE is_resolved = false
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule low stock check every hour
SELECT cron.schedule('hourly-low-stock-check', '0 * * * *', 'SELECT check_low_stock_alerts()');

-- RLS Policies
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE low_stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- Staff can manage inventory
CREATE POLICY "Staff can manage inventory transactions" ON inventory_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Staff can view and manage low stock alerts
CREATE POLICY "Staff can manage low stock alerts" ON low_stock_alerts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Staff can view inventory snapshots
CREATE POLICY "Staff can view inventory snapshots" ON inventory_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('supervisor', 'manager', 'admin')
    )
  );

-- Update products table RLS to allow staff to update stock
CREATE POLICY "Staff can update product inventory" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );
