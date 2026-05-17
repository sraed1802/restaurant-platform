import { useEffect, useRef } from 'react'
import { elevateSurfaceHex } from '../lib/colorUtils'
import { useRestaurantSettings } from './useRestaurantSettings'
import { useThemeStore } from '../store/themeStore'

const FONT_LINK_DEBOUNCE_MS = 320

export function useDynamicTheme() {
  const { settings } = useRestaurantSettings()
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme)
  const lastFontHrefRef = useRef<string | null>(null)
  const fontDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!settings) return

    const root = document.documentElement
    const elevated = elevateSurfaceHex(settings.surface_color, 0.08)
    const themedPaletteVars = [
      '--cream',
      '--surface',
      '--surface-elevated',
      '--ink',
      '--ink-muted',
      '--ink-soft',
      '--border',
      '--border-strong',
      '--gold',
      '--gold-dark',
      '--gold-dim',
    ]

    root.style.setProperty('--primary', settings.primary_color)
    root.style.setProperty('--secondary', settings.secondary_color)
    root.style.setProperty('--accent', settings.accent_color)

    if (effectiveTheme === 'dark') {
      for (const variableName of themedPaletteVars) {
        root.style.removeProperty(variableName)
      }
    } else {
      root.style.setProperty('--cream', settings.background_color)
      root.style.setProperty('--surface', settings.surface_color)
      root.style.setProperty('--surface-elevated', elevated)
      root.style.setProperty('--ink', settings.text_color)
      root.style.setProperty('--ink-muted', settings.text_muted_color)
      root.style.setProperty('--ink-soft', settings.text_muted_color)
      root.style.setProperty('--border', settings.border_color)
      root.style.setProperty('--border-strong', settings.border_color)
      root.style.setProperty('--gold', settings.primary_color)
      root.style.setProperty('--gold-dark', settings.secondary_color)
      root.style.setProperty('--gold-dim', settings.accent_color)
    }

    root.style.setProperty('--font-body', settings.font_family)
    root.style.setProperty('--font-display', settings.heading_font)
    document.body.style.fontFamily = settings.font_family

    const fontFamilies = [
      settings.font_family.split(',')[0]?.trim(),
      settings.heading_font.split(',')[0]?.trim(),
    ].filter(Boolean)

    const nextHref =
      fontFamilies.length > 0
        ? `https://fonts.googleapis.com/css2?family=${fontFamilies.join('&family=').replace(/ /g, '+')}&display=swap`
        : null

    if (!nextHref) {
      if (fontDebounceRef.current) {
        clearTimeout(fontDebounceRef.current)
        fontDebounceRef.current = null
      }
      document.querySelector('link[data-dynamic-fonts]')?.remove()
      lastFontHrefRef.current = null
      return
    }

    if (nextHref === lastFontHrefRef.current) {
      return
    }

    if (fontDebounceRef.current) {
      clearTimeout(fontDebounceRef.current)
    }

    fontDebounceRef.current = setTimeout(() => {
      fontDebounceRef.current = null
      if (nextHref === lastFontHrefRef.current) return

      lastFontHrefRef.current = nextHref
      document.querySelector('link[data-dynamic-fonts]')?.remove()

      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = nextHref
      link.setAttribute('data-dynamic-fonts', 'true')
      document.head.appendChild(link)
    }, FONT_LINK_DEBOUNCE_MS)

    return () => {
      if (fontDebounceRef.current) {
        clearTimeout(fontDebounceRef.current)
        fontDebounceRef.current = null
      }
    }
  }, [effectiveTheme, settings])
}
