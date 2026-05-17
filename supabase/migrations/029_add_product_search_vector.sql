-- Add a full-text search vector for products to support faster menu search
ALTER TABLE products
ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name_en, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(name_ar, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description_en, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description_ar, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON products USING GIN (search_vector);
