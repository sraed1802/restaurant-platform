-- Dedicated combo promotions for fixed-price meal bundles.

CREATE TABLE IF NOT EXISTS combo_promotions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  name_en           text NOT NULL,
  name_ar           text NOT NULL,
  headline_en       text,
  headline_ar       text,
  description_en    text,
  description_ar    text,
  promo_price       numeric(10,3) NOT NULL CHECK (promo_price >= 0),
  original_price    numeric(10,3) NOT NULL CHECK (original_price >= promo_price),
  image_url         text,
  model_asset_url   text,
  badge_text_en     text,
  badge_text_ar     text,
  accent_color      text NOT NULL DEFAULT '#B8975A',
  secondary_color   text NOT NULL DEFAULT '#6D28D9',
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  is_featured       boolean NOT NULL DEFAULT true,
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS combo_promotion_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  combo_promotion_id  uuid NOT NULL REFERENCES combo_promotions(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  item_role           text NOT NULL DEFAULT 'main'
                      CHECK (item_role IN ('main', 'side', 'drink', 'dessert', 'optional_drink')),
  quantity            int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  display_order       int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_promotions_active_featured
  ON combo_promotions(is_active, is_featured, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_combo_promotions_schedule
  ON combo_promotions(starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo
  ON combo_promotion_items(combo_promotion_id);

CREATE INDEX IF NOT EXISTS idx_combo_items_product
  ON combo_promotion_items(product_id);

DROP TRIGGER IF EXISTS trg_combo_promotions_updated_at ON combo_promotions;
CREATE TRIGGER trg_combo_promotions_updated_at
  BEFORE UPDATE ON combo_promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE combo_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_promotion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_promotions_public_read_active" ON combo_promotions;
CREATE POLICY "combo_promotions_public_read_active" ON combo_promotions
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS "combo_promotions_authenticated_read_all" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_read_all" ON combo_promotions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_promotions_authenticated_insert" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_insert" ON combo_promotions
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotions_authenticated_update" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_update" ON combo_promotions
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotions_authenticated_delete" ON combo_promotions;
CREATE POLICY "combo_promotions_authenticated_delete" ON combo_promotions
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_promotion_items_public_read_active" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_public_read_active" ON combo_promotion_items
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM combo_promotions cp
      WHERE cp.id = combo_promotion_items.combo_promotion_id
        AND cp.is_active = true
        AND (cp.starts_at IS NULL OR cp.starts_at <= now())
        AND (cp.ends_at IS NULL OR cp.ends_at > now())
    )
  );

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_read_all" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_read_all" ON combo_promotion_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_insert" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_insert" ON combo_promotion_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_update" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_update" ON combo_promotion_items
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "combo_promotion_items_authenticated_delete" ON combo_promotion_items;
CREATE POLICY "combo_promotion_items_authenticated_delete" ON combo_promotion_items
  FOR DELETE TO authenticated
  USING (true);
