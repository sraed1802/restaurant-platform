-- ============================================================
-- Restaurant Settings
-- ============================================================

-- Restaurant settings table for admin customization
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_name_en text NOT NULL DEFAULT 'The Restaurant',
  restaurant_name_ar text NOT NULL DEFAULT 'المطعم',
  restaurant_tagline_en text DEFAULT 'A Premium Experience',
  restaurant_tagline_ar text DEFAULT 'تجربة فاخرة',
  logo_url text,
  contact_phone text DEFAULT '+966-50-123-4567',
  contact_email text DEFAULT 'info@restaurant.com',
  contact_address_en text,
  contact_address_ar text,
  social_facebook text,
  social_instagram text,
  social_twitter text,
  social_whatsapp text,
  delivery_banner_enabled boolean NOT NULL DEFAULT false,
  delivery_banner_text_en text,
  delivery_banner_text_ar text,
  delivery_threshold numeric DEFAULT 50,
  currency_code text NOT NULL DEFAULT 'QAR',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO restaurant_settings (
  restaurant_name_en, restaurant_name_ar, restaurant_tagline_en, restaurant_tagline_ar,
  delivery_banner_text_en, delivery_banner_text_ar
) VALUES (
  'The Restaurant', 'المطعم', 'A Premium Experience', 'تجربة فاخرة',
  'Free delivery on orders over 50 QAR', 'توصيل مجاني للطلبات فوق 50 ريال'
) ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view and update settings
CREATE POLICY "Admins can view settings" ON restaurant_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Admins can update settings" ON restaurant_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE id = auth.uid() 
      AND app_role IN ('manager', 'admin')
    )
  );

-- Public can view settings (for customer app)
CREATE POLICY "Public can view settings" ON restaurant_settings
  FOR SELECT USING (true);
