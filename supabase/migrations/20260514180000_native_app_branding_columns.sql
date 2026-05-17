-- Optional branding for native shells + admin chrome (public read via existing restaurant_settings policy)

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS loading_logo_url text,
  ADD COLUMN IF NOT EXISTS admin_shell_logo_url text,
  ADD COLUMN IF NOT EXISTS welcome_logo_url text,
  ADD COLUMN IF NOT EXISTS native_loading_text_en text,
  ADD COLUMN IF NOT EXISTS native_loading_text_ar text;

COMMENT ON COLUMN public.restaurant_settings.loading_logo_url IS 'Native loading / splash image; falls back to logo_url';
COMMENT ON COLUMN public.restaurant_settings.admin_shell_logo_url IS 'Admin sidebar / mobile header logo; falls back to logo_url';
COMMENT ON COLUMN public.restaurant_settings.welcome_logo_url IS 'Customer native welcome wordmark; falls back to loading_logo_url then logo_url';
COMMENT ON COLUMN public.restaurant_settings.native_loading_text_en IS 'Customer native loading subtitle (English)';
COMMENT ON COLUMN public.restaurant_settings.native_loading_text_ar IS 'Customer native loading subtitle (Arabic)';
