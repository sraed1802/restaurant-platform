import { supabase } from '../lib/supabase'

export type PublicRestaurantBranding = {
  restaurant_name_en: string
  restaurant_name_ar: string
  restaurant_tagline_en: string
  logo_url: string | null
  loading_logo_url: string | null
  welcome_logo_url: string | null
  driver_shell_logo_url: string | null
  native_loading_text_en: string | null
  native_loading_text_ar: string | null
  primary_color: string | null
}

const DEFAULTS: PublicRestaurantBranding = {
  restaurant_name_en: 'The Restaurant',
  restaurant_name_ar: 'المطعم',
  restaurant_tagline_en: 'Driver',
  logo_url: null,
  loading_logo_url: null,
  welcome_logo_url: null,
  driver_shell_logo_url: null,
  native_loading_text_en: null,
  native_loading_text_ar: null,
  primary_color: '#b8975a',
}

export async function fetchPublicRestaurantBranding(): Promise<PublicRestaurantBranding> {
  const { data, error } = await supabase
    .from('restaurant_settings')
    .select(
      'restaurant_name_en, restaurant_name_ar, restaurant_tagline_en, logo_url, loading_logo_url, welcome_logo_url, driver_shell_logo_url, native_loading_text_en, native_loading_text_ar, primary_color',
    )
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    console.warn('fetchPublicRestaurantBranding', error)
  }

  const row = data as Partial<PublicRestaurantBranding> | null
  return row ? { ...DEFAULTS, ...row } : DEFAULTS
}
