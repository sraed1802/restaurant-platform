-- ============================================================
-- Add Color Scheme to Restaurant Settings
-- ============================================================

-- Add color scheme columns to restaurant_settings table
ALTER TABLE restaurant_settings 
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#b8975a',
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#d4a574',
ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#c19a6b',
ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#faf8f4',
ADD COLUMN IF NOT EXISTS surface_color TEXT DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT '#2c1810',
ADD COLUMN IF NOT EXISTS text_muted_color TEXT DEFAULT '#6b5d54',
ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT '#e5ddd5',
ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Inter, system-ui, sans-serif',
ADD COLUMN IF NOT EXISTS heading_font TEXT DEFAULT 'Playfair Display, serif';

-- Update existing records with default color values
UPDATE restaurant_settings 
SET 
  primary_color = COALESCE(primary_color, '#b8975a'),
  secondary_color = COALESCE(secondary_color, '#d4a574'),
  accent_color = COALESCE(accent_color, '#c19a6b'),
  background_color = COALESCE(background_color, '#faf8f4'),
  surface_color = COALESCE(surface_color, '#ffffff'),
  text_color = COALESCE(text_color, '#2c1810'),
  text_muted_color = COALESCE(text_muted_color, '#6b5d54'),
  border_color = COALESCE(border_color, '#e5ddd5'),
  font_family = COALESCE(font_family, 'Inter, system-ui, sans-serif'),
  heading_font = COALESCE(heading_font, 'Playfair Display, serif')
WHERE primary_color IS NULL 
   OR secondary_color IS NULL 
   OR accent_color IS NULL 
   OR background_color IS NULL 
   OR surface_color IS NULL 
   OR text_color IS NULL 
   OR text_muted_color IS NULL 
   OR border_color IS NULL 
   OR font_family IS NULL 
   OR heading_font IS NULL;
