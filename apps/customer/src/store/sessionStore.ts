// apps/customer/src/store/sessionStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import type { Language, DeliveryAddress } from '../../types'
import type { OutsideDeliveryAddress } from '@rms/supabase/types'
import { isOutsideDeliveryAddress } from '@rms/supabase/fulfillment'
import { createCustomerJsonPersistStorage } from '../lib/customerPersistStorage'
import type { CustomerProfileRow } from '../services/customerProfile'

type OtpState = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified' | 'error'

function deliveryAddressFromAuthMetadata(user: User): DeliveryAddress | null {
  const md = user.user_metadata
  if (!md || typeof md !== 'object') return null
  const raw = md.delivery_address
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.mode === 'hotel_room_delivery') return null
  const street = typeof o.street === 'string' ? o.street.trim() : ''
  const building = typeof o.building === 'string' ? o.building.trim() : ''
  const area = typeof o.area === 'string' ? o.area.trim() : ''
  const cityRaw = typeof o.city === 'string' ? o.city.trim() : ''
  const city = cityRaw || 'Doha'
  if (!street || !building || !area) return null
  const addr: OutsideDeliveryAddress = { street, building, area, city }
  if (typeof o.floor === 'string' && o.floor.trim()) addr.floor = o.floor.trim()
  if (typeof o.apartment === 'string' && o.apartment.trim()) addr.apartment = o.apartment.trim()
  return addr
}

function phoneFromAuthMetadata(user: User): string | null {
  const md = user.user_metadata
  if (!md || typeof md !== 'object') return null
  if (typeof md.phone_e164 === 'string' && md.phone_e164.trim()) return md.phone_e164.trim()
  if (typeof md.phone === 'string' && md.phone.trim()) return md.phone.trim()
  return null
}

interface SessionStore {
  // Identity
  sessionId: string
  phone: string
  customerId: string | null
  customerEmail: string | null
  customerName: string | null
  isVerified: boolean

  // OTP flow
  otpState: OtpState
  otpError: string | null
  pendingOrderId: string | null

  // Preferences
  language: Language
  deliveryAddress: DeliveryAddress | null

  // Category browsing history (for AI affinity)
  categoryHistory: string[]

  // Actions
  initSession: () => void
  setPhone: (phone: string) => void
  setCustomerName: (name: string) => void
  setOtpState: (state: OtpState, error?: string) => void
  setVerified: (customerId: string) => void
  setLanguage: (lang: Language) => void
  setDeliveryAddress: (addr: DeliveryAddress) => void
  setPendingOrderId: (id: string | null) => void
  addCategoryView: (categoryId: string) => void
  syncFromAuthUser: (user: User) => void
  applyCustomerProfileRow: (row: CustomerProfileRow) => void
  clearAuth: () => void
  reset: () => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessionId: '',
      phone: '',
      customerId: null,
      customerEmail: null,
      customerName: null,
      isVerified: false,
      otpState: 'idle',
      otpError: null,
      pendingOrderId: null,
      language: 'en',
      deliveryAddress: null,
      categoryHistory: [],

      initSession: () => {
        const { sessionId } = get()
        if (!sessionId) {
          set({ sessionId: crypto.randomUUID() })
        }
      },

      setPhone: (phone) => set({ phone }),
      setCustomerName: (name) => set({ customerName: name }),
      setOtpState: (otpState, otpError?: string | null) =>
        set({ otpState, otpError: otpError ?? null }),

      setVerified: (customerId) =>
        set({ isVerified: true, customerId, otpState: 'verified' }),

      syncFromAuthUser: (user) =>
        set((state) => {
          const md = user.user_metadata
          const first =
            md && typeof md === 'object' && typeof md.first_name === 'string' ? md.first_name.trim() : ''
          const last =
            md && typeof md === 'object' && typeof md.last_name === 'string' ? md.last_name.trim() : ''
          const composed = `${first} ${last}`.trim()
          const fromMeta =
            md && typeof md === 'object' && typeof md.full_name === 'string' ? md.full_name.trim() : ''
          const delivery = deliveryAddressFromAuthMetadata(user)
          const phoneMeta = phoneFromAuthMetadata(user)
          return {
            customerId: user.id,
            customerEmail: user.email ?? null,
            isVerified: true,
            otpState: 'verified',
            otpError: null,
            customerName:
              (fromMeta || null) ??
              (composed || null) ??
              (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null) ??
              state.customerName,
            phone: phoneMeta ?? state.phone,
            deliveryAddress: delivery ?? state.deliveryAddress,
          }
        }),

      applyCustomerProfileRow: (row) =>
        set((state) => {
          const addresses = row.delivery_addresses ?? []
          const outside = addresses.filter((a): a is OutsideDeliveryAddress => isOutsideDeliveryAddress(a))
          const defaultAddr =
            outside.find((a) => a.is_default) ?? outside[0] ?? null
          return {
            customerName: row.name ?? state.customerName,
            phone: row.phone_e164 ?? state.phone,
            deliveryAddress: defaultAddr ?? state.deliveryAddress,
          }
        }),

      clearAuth: () =>
        set({
          customerId: null,
          customerEmail: null,
          isVerified: false,
          otpState: 'idle',
          otpError: null,
          pendingOrderId: null,
        }),

      setLanguage: (language) => {
        set({ language })
        document.documentElement.lang = language
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
      },

      setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),

      setPendingOrderId: (pendingOrderId) => set({ pendingOrderId }),

      addCategoryView: (categoryId) =>
        set((state) => ({
          categoryHistory: [
            categoryId,
            ...state.categoryHistory.filter((id) => id !== categoryId),
          ].slice(0, 10),
        })),

      reset: () =>
        set({
          phone: '',
          customerId: null,
          customerEmail: null,
          customerName: null,
          isVerified: false,
          otpState: 'idle',
          otpError: null,
          pendingOrderId: null,
          deliveryAddress: null,
        }),
    }),
    {
      name: 'rms-session',
      storage: createCustomerJsonPersistStorage('rms-session', 'rms-session-native'),
      partialize: (state) => ({
        sessionId: state.sessionId,
        phone: state.phone,
        customerId: state.customerId,
        customerEmail: state.customerEmail,
        customerName: state.customerName,
        isVerified: state.isVerified,
        pendingOrderId: state.pendingOrderId,
        language: state.language,
        deliveryAddress: state.deliveryAddress,
        categoryHistory: state.categoryHistory,
      }),
    }
  )
)
