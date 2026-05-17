-- ============================================================
-- Customer Reviews System
-- ============================================================

-- Reviews table for customer feedback
CREATE TABLE IF NOT EXISTS customer_reviews (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  rating          integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title           text,
  comment         text,
  photos          jsonb DEFAULT '[]',
  is_verified     boolean NOT NULL DEFAULT false,
  is_featured     boolean NOT NULL DEFAULT false,
  helpful_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Review helpful votes
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id       uuid NOT NULL REFERENCES customer_reviews(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id, customer_id)
);

-- Review responses from restaurant
CREATE TABLE IF NOT EXISTS review_responses (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id       uuid NOT NULL REFERENCES customer_reviews(id) ON DELETE CASCADE,
  staff_id        uuid REFERENCES staff(id) ON DELETE SET NULL,
  response        text NOT NULL,
  is_public       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_customer_reviews_product_id ON customer_reviews(product_id);
CREATE INDEX idx_customer_reviews_customer_id ON customer_reviews(customer_id);
CREATE INDEX idx_customer_reviews_order_id ON customer_reviews(order_id);
CREATE INDEX idx_customer_reviews_rating ON customer_reviews(rating);
CREATE INDEX idx_customer_reviews_created_at ON customer_reviews(created_at DESC);
CREATE INDEX idx_customer_reviews_is_featured ON customer_reviews(is_featured) WHERE is_featured = true;

-- Update product average rating trigger
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products 
  SET 
    average_rating = (
      SELECT COALESCE(AVG(rating), 0) 
      FROM customer_reviews 
      WHERE product_id = NEW.product_id AND is_verified = true
    ),
    review_count = (
      SELECT COUNT(*) 
      FROM customer_reviews 
      WHERE product_id = NEW.product_id AND is_verified = true
    )
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for rating updates
DROP TRIGGER IF EXISTS trigger_update_product_rating ON customer_reviews;
CREATE TRIGGER trigger_update_product_rating
  AFTER INSERT OR UPDATE OR DELETE ON customer_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_product_rating();

-- RLS Policies
ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;

-- Customers can view all verified reviews
CREATE POLICY "Customers can view verified reviews" ON customer_reviews
  FOR SELECT USING (
    is_verified = true OR 
    auth.uid() = customer_id
  );

-- Customers can insert reviews for products they've ordered
CREATE POLICY "Customers can insert reviews" ON customer_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = customer_id AND
    EXISTS (
      SELECT 1 FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.customer_id = auth.uid() 
      AND oi.product_id = product_id
      AND o.status = 'delivered'
    )
  );

-- Customers can update their own reviews
CREATE POLICY "Customers can update own reviews" ON customer_reviews
  FOR UPDATE USING (auth.uid() = customer_id);

-- Customers can delete their own reviews
CREATE POLICY "Customers can delete own reviews" ON customer_reviews
  FOR DELETE USING (auth.uid() = customer_id);

-- Helpful votes policies
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can vote on reviews" ON review_helpful_votes
  FOR ALL WITH CHECK (auth.uid() = customer_id);

-- Review responses policies
ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

-- Staff can manage review responses
CREATE POLICY "Staff can manage review responses" ON review_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Add columns to products table if they don't exist
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0;
