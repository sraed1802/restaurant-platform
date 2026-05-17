import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface RestaurantSettings {
  restaurant_name_en: string
  restaurant_name_ar: string
  restaurant_tagline_en: string
  restaurant_tagline_ar: string
  logo_url: string | null
  loading_logo_url: string | null
  welcome_logo_url: string | null
  native_loading_text_en: string | null
  native_loading_text_ar: string | null
  contact_phone: string
  contact_email: string
  contact_address_en: string | null
  contact_address_ar: string | null
  social_facebook: string | null
  social_instagram: string | null
  social_twitter: string | null
  social_whatsapp: string | null
  delivery_banner_enabled: boolean
  delivery_banner_text_en: string | null
  delivery_banner_text_ar: string | null
  delivery_threshold: number
  currency_code: string
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  surface_color: string
  text_color: string
  text_muted_color: string
  border_color: string
  font_family: string
  heading_font: string
  enable_service_dine_in: boolean
  enable_service_takeaway: boolean
  enable_service_delivery: boolean
  hero_title_en: string | null
  hero_title_ar: string | null
  hero_subtitle_en: string | null
  hero_subtitle_ar: string | null
  hero_image_url: string | null
  cancellation_policy_en: string | null
  cancellation_policy_ar: string | null
  meta_description_en: string | null
  meta_description_ar: string | null
}

type RestaurantSettingsRow = Partial<RestaurantSettings>

const DEFAULT_SETTINGS: RestaurantSettings = {
  restaurant_name_en: 'The Restaurant',
  restaurant_name_ar: 'المطعم',
  restaurant_tagline_en: 'A Premium Experience',
  restaurant_tagline_ar: 'تجربة فاخرة',
  logo_url: null,
  loading_logo_url: null,
  welcome_logo_url: null,
  native_loading_text_en: null,
  native_loading_text_ar: null,
  contact_phone: '+966-50-123-4567',
  contact_email: 'info@restaurant.com',
  contact_address_en: null,
  contact_address_ar: null,
  social_facebook: null,
  social_instagram: null,
  social_twitter: null,
  social_whatsapp: null,
  delivery_banner_enabled: false,
  delivery_banner_text_en: null,
  delivery_banner_text_ar: null,
  delivery_threshold: 50,
  currency_code: 'QAR',
  primary_color: '#b8975a',
  secondary_color: '#d4a574',
  accent_color: '#c19a6b',
  background_color: '#faf8f4',
  surface_color: '#ffffff',
  text_color: '#2c1810',
  text_muted_color: '#6b5d54',
  border_color: '#e5ddd5',
  font_family: 'Inter, system-ui, sans-serif',
  heading_font: 'Playfair Display, serif',
  enable_service_dine_in: true,
  enable_service_takeaway: true,
  enable_service_delivery: true,
  hero_title_en: null,
  hero_title_ar: null,
  hero_subtitle_en: null,
  hero_subtitle_ar: null,
  hero_image_url: null,
  cancellation_policy_en: null,
  cancellation_policy_ar: null,
  meta_description_en: null,
  meta_description_ar: null,
}

async function fetchRestaurantSettings(): Promise<RestaurantSettings> {
  const { data, error } = await supabase.from('restaurant_settings').select('*').maybeSingle()

  if (error && error.code !== 'PGRST116') {
    console.error('Error loading restaurant settings:', error)
  }

  const settingsRow = data as RestaurantSettingsRow | null
  return settingsRow ? { ...DEFAULT_SETTINGS, ...settingsRow } : DEFAULT_SETTINGS
}

export function useRestaurantSettings() {
  const query = useQuery({
    queryKey: ['restaurant_settings'],
    queryFn: fetchRestaurantSettings,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  })

  return {
    settings: query.data ?? DEFAULT_SETTINGS,
    loading: query.isPending,
  }
}
