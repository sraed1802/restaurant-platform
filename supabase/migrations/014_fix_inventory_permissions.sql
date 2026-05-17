-- Fix inventory function permissions
-- Grant execute permission on update_product_stock function to authenticated users with proper roles

-- Drop existing function and recreate with proper security
DROP FUNCTION IF EXISTS update_product_stock(uuid, integer, text, text, uuid, text);

-- Recreate function with security definer
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
  v_user_role text;
BEGIN
  -- Get user role from staff table
  SELECT app_role INTO v_user_role
  FROM staff
  WHERE id = auth.uid();
  
  -- Check if user has proper permissions
  IF v_user_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to update inventory';
  END IF;
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_product_stock TO authenticated;
