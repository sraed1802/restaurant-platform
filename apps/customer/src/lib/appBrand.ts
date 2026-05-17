/** Customer app display name in native shell and loading UI (Latin) */
export const CUSTOMER_APP_DISPLAY_NAME = 'Maazym'

/** Arabic app name (welcome screen, native header, etc.) */
export const CUSTOMER_APP_DISPLAY_NAME_AR = 'معازيم'

const CUSTOMER_SUPABASE_STORAGE_PUBLIC =
  'https://gwjisaswagnfukvjllgb.supabase.co/storage/v1/object/public'

/** Public menu bucket logo (same asset as Android adaptive icon source) */
export const CUSTOMER_APP_LOGO_URL = `${CUSTOMER_SUPABASE_STORAGE_PUBLIC}/menu/vektomhffrp.png`

/** Bump when replacing `Logo-White.png` in Storage so the app does not keep an old cached image. */
export const CUSTOMER_APP_WELCOME_LOGO_CACHE_KEY = '3'

/** White wordmark on the native welcome screen — public `restaurant` bucket, object `Logo-White.png`. */
export const CUSTOMER_APP_WELCOME_LOGO_WHITE_URL = `${CUSTOMER_SUPABASE_STORAGE_PUBLIC}/restaurant/Logo-White.png?v=${CUSTOMER_APP_WELCOME_LOGO_CACHE_KEY}`
