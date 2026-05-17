import { useEffect } from 'react'
import type { Language } from '../../types'
import { useRestaurantSettings } from './useRestaurantSettings'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function useDocumentMeta(language: Language) {
  const { settings } = useRestaurantSettings()

  useEffect(() => {
    const name =
      language === 'ar' ? settings.restaurant_name_ar : settings.restaurant_name_en
    const tag =
      language === 'ar' ? settings.restaurant_tagline_ar : settings.restaurant_tagline_en
    const descRaw =
      language === 'ar' ? settings.meta_description_ar : settings.meta_description_en
    const description =
      (typeof descRaw === 'string' && descRaw.trim()) ||
      `${tag}. Order for delivery or takeaway.`

    document.title = `${name} · ${language === 'ar' ? 'الطلب' : 'Order'}`

    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', document.title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'twitter:card', 'summary_large_image')
    if (settings.logo_url) {
      upsertMeta('property', 'og:image', settings.logo_url)
    }
  }, [language, settings])
}
