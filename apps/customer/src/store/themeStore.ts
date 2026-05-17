// apps/customer/src/store/themeStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createCustomerJsonPersistStorage } from '../lib/customerPersistStorage'

type Theme = 'light' | 'dark' | 'system'

interface ThemeStore {
  theme: Theme
  effectiveTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyThemeToDocument(theme: Theme): 'light' | 'dark' {
  const effective = getEffectiveTheme(theme)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', effective)
  }
  return effective
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get): ThemeStore => {
      const updateEffectiveTheme = (theme: Theme) => {
        return applyThemeToDocument(theme)
      }

      // Initialize theme on mount
      if (typeof window !== 'undefined') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleChange = () => {
          const { theme } = get()
          if (theme === 'system') {
            set({ effectiveTheme: getEffectiveTheme('system') })
            updateEffectiveTheme('system')
          }
        }
        mediaQuery.addEventListener('change', handleChange)
      }

      return {
        theme: 'system',
        effectiveTheme: typeof window !== 'undefined' ? getEffectiveTheme('system') : 'light',
        setTheme: (theme) => {
          const effective = updateEffectiveTheme(theme)
          set({ theme, effectiveTheme: effective })
        },
        toggleTheme: () => {
          const { theme } = get()
          const newTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
          const effective = updateEffectiveTheme(newTheme)
          set({ theme: newTheme, effectiveTheme: effective })
        }
      }
    },
    {
      name: 'rms-theme',
      storage: createCustomerJsonPersistStorage('rms-theme', 'rms-theme-native'),
      partialize: (state) => ({ theme: state.theme }),
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState as ThemeStore
        }
        const p = persistedState as Partial<ThemeStore>
        const nextTheme = (p.theme ?? currentState.theme) as Theme
        const effective = applyThemeToDocument(nextTheme)
        return {
          ...(currentState as ThemeStore),
          ...p,
          theme: nextTheme,
          effectiveTheme: effective,
        }
      },
    }
  )
)

if (typeof window !== 'undefined') {
  applyThemeToDocument(useThemeStore.getState().theme)
}
