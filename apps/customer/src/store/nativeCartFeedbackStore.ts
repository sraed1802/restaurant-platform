import { create } from 'zustand'

type NativeCartFeedbackState = {
  cartToast: string | null
  cartBump: number
  showCartAdded: (productLabel: string) => void
  dismissToast: () => void
}

let toastTimer = 0

export const useNativeCartFeedbackStore = create<NativeCartFeedbackState>((set, get) => ({
  cartToast: null,
  cartBump: 0,
  showCartAdded: (productLabel) => {
    if (typeof window === 'undefined') return
    if (toastTimer) window.clearTimeout(toastTimer)
    set({
      cartToast: productLabel,
      cartBump: get().cartBump + 1,
    })
    toastTimer = window.setTimeout(() => {
      set({ cartToast: null })
      toastTimer = 0
    }, 2800)
  },
  dismissToast: () => {
    if (toastTimer) window.clearTimeout(toastTimer)
    toastTimer = 0
    set({ cartToast: null })
  },
}))
