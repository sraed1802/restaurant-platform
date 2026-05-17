-- Guest experience & service modes for luxury positioning (customer-facing)

ALTER TABLE restaurant_settings
ADD COLUMN IF NOT EXISTS enable_service_dine_in boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_service_takeaway boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_service_delivery boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS hero_title_en text,
ADD COLUMN IF NOT EXISTS hero_title_ar text,
ADD COLUMN IF NOT EXISTS hero_subtitle_en text,
ADD COLUMN IF NOT EXISTS hero_subtitle_ar text,
ADD COLUMN IF NOT EXISTS hero_image_url text,
ADD COLUMN IF NOT EXISTS cancellation_policy_en text,
ADD COLUMN IF NOT EXISTS cancellation_policy_ar text,
ADD COLUMN IF NOT EXISTS meta_description_en text,
ADD COLUMN IF NOT EXISTS meta_description_ar text;

COMMENT ON COLUMN restaurant_settings.enable_service_dine_in IS 'Show dine-in option in guest ordering UX';
COMMENT ON COLUMN restaurant_settings.hero_title_en IS 'Optional editorial hero headline (English)';
