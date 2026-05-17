-- Driver app shell / boot branding (public read via restaurant_settings)

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS driver_shell_logo_url text;

COMMENT ON COLUMN public.restaurant_settings.driver_shell_logo_url IS 'Driver app boot / header logo; falls back to loading_logo_url then logo_url';
