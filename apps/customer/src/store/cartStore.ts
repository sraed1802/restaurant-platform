// apps/customer/src/store/cartStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { createCartPartitionPersistStorage } from '../lib/cartPartitionStorage'
import { asRows } from '../lib/supabaseTypeWorkarounds'
import type { Product, CartItem, Promotion, ComboPromotion, AppliedComboMatch } from '../../types'
import { fetchActiveComboPromotions } from '../services/comboPromotions'
import { evaluateComboPricing } from '../../../../supabase/functions/_shared/comboPricing'

const DELIVERY_FEE = 1.0 // Default fallback, will be overridden by system_config

interface SystemConfig {
  freeDeliveryEnabled: boolean
  freeDeliveryMinOrder: number
}

interface SystemConfigRow {
  key: string
  value: unknown
}

interface CartStore {
  items: CartItem[]
  appliedPromotion: Promotion | null
  appliedCombos: AppliedComboMatch[]
  comboPromotions: ComboPromotion[]
  promoError: string | null
  deliveryFeeValue: number
  systemConfig: SystemConfig
  selectedProduct: Product | null
  quantity: number
  modifiers: Record<string, string[]>
  notes: string

  // Computed
  subtotal: () => number
  comboDiscountAmount: () => number
  discountAmount: () => number
  deliveryFee: () => number
  total: () => number
  itemCount: () => number

  // Actions
  addItem: (product: Product, quantity: number, selectedModifiers: Record<string, string[]>, notes?: string) => void
  removeItem: (cartItemId: string) => void
  updateQuantity: (cartItemId: string, quantity: number) => void
  clearCart: () => void
  applyPromotion: (promo: Promotion) => void
  removePromotion: () => void
  setComboPromotions: (combos: ComboPromotion[]) => void
  loadComboPromotions: () => Promise<void>
  setPromoError: (error: string | null) => void
  loadDeliveryFee: () => Promise<void>
  initializeDeliveryFee: () => Promise<void>
  setSelectedProduct: (product: Product | null) => void
  setQuantity: (quantity: number) => void
  setModifiers: (modifiers: Record<string, string[]>) => void
  setNotes: (notes: string) => void
}

function computeLineTotal(
  product: Product,
  quantity: number,
  selectedModifiers: Record<string, string[]>
): number {
  let modifierTotal = 0
  if (product.modifier_groups) {
    for (const group of product.modifier_groups) {
      const selectedIds = selectedModifiers[group.id] ?? []
      for (const option of group.options) {
        if (selectedIds.includes(option.id)) {
          modifierTotal += option.price_delta
        }
      }
    }
  }
  return (product.base_price + modifierTotal) * quantity
}

function normalizeSelectedModifiers(
  selectedModifiers: Record<string, string[]>
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(selectedModifiers)
      .map(([groupId, optionIds]): [string, string[]] => [
        groupId,
        [...optionIds].sort((a, b) => a.localeCompare(b)),
      ])
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

function normalizeCartNotes(notes: string): string {
  return notes.trim()
}

export function buildCartItemId(
  productId: string,
  selectedModifiers: Record<string, string[]>,
  notes = ''
): string {
  return JSON.stringify({
    productId,
    selectedModifiers: normalizeSelectedModifiers(selectedModifiers),
    notes: normalizeCartNotes(notes),
  })
}

function resolveCartItemId(item: Pick<CartItem, 'product' | 'selectedModifiers' | 'notes'> & { cartItemId?: string }): string {
  return item.cartItemId ?? buildCartItemId(item.product.id, item.selectedModifiers, item.notes)
}

function computeAppliedCombos(
  items: CartItem[],
  comboPromotions: ComboPromotion[]
): AppliedComboMatch[] {
  return evaluateComboPricing(
    items.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    })),
    comboPromotions.map((combo) => ({
      id: combo.id,
      name_en: combo.name_en,
      name_ar: combo.name_ar,
      promo_price: combo.promo_price,
      original_price: combo.original_price,
      is_active: combo.is_active,
      items: (combo.items ?? []).map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        item_role: item.item_role,
        display_order: item.display_order,
      })),
    }))
  ).matchedCombos as AppliedComboMatch[]
}

function sumAppliedComboSavings(matches: AppliedComboMatch[]): number {
  return matches.reduce((sum, match) => sum + match.savings, 0)
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get): CartStore => ({
      items: [],
      appliedPromotion: null,
      appliedCombos: [],
      comboPromotions: [],
      promoError: null,
      deliveryFeeValue: DELIVERY_FEE,
      systemConfig: {
        freeDeliveryEnabled: false,
        freeDeliveryMinOrder: 0,
      },
      selectedProduct: null,
      quantity: 1,
      modifiers: {},
      notes: '',

      subtotal: () =>
        get().items.reduce((sum, item) => sum + item.lineTotal, 0),

      comboDiscountAmount: () => sumAppliedComboSavings(get().appliedCombos),

      discountAmount: () => {
        const { appliedPromotion, subtotal, comboDiscountAmount } = get()
        let promotionDiscount = 0

        if (appliedPromotion) {
          if (appliedPromotion.discount_type === 'fixed') {
            promotionDiscount = appliedPromotion.discount_value
          } else if (appliedPromotion.discount_type === 'percentage') {
            const raw = subtotal() * (appliedPromotion.discount_value / 100)
            promotionDiscount = appliedPromotion.max_discount_cap
              ? Math.min(raw, appliedPromotion.max_discount_cap)
              : raw
          }
        }

        return comboDiscountAmount() + promotionDiscount
      },

      // Synchronous — reads from cached state, no DB calls on render
      deliveryFee: () => {
        const { appliedPromotion, deliveryFeeValue, systemConfig } = get()
        // Free delivery from promotion takes precedence
        if (appliedPromotion?.discount_type === 'free_delivery') {
          return 0
        }
        // Free delivery from system config overrides all other conditions
        if (systemConfig.freeDeliveryEnabled) {
          return 0
        }
        return deliveryFeeValue
      },

      // Synchronous
      total: () => {
        const { subtotal, discountAmount, deliveryFee } = get()
        return Math.max(0, subtotal() - discountAmount() + deliveryFee())
      },

      itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      addItem: (product, quantity, selectedModifiers, notes = '') => {
        const normalizedNotes = normalizeCartNotes(notes)
        const normalizedModifiers = normalizeSelectedModifiers(selectedModifiers)
        const cartItemId = buildCartItemId(product.id, normalizedModifiers, normalizedNotes)
        const lineTotal = computeLineTotal(product, quantity, normalizedModifiers)
        set((state) => {
          const existing = state.items.findIndex((item) => resolveCartItemId(item) === cartItemId)
          if (existing >= 0) {
            const updated = [...state.items]
            const item = updated[existing]
            const nextItems = [...updated]
            nextItems[existing] = {
              ...item,
              cartItemId,
              quantity: item.quantity + quantity,
              lineTotal: computeLineTotal(product, item.quantity + quantity, item.selectedModifiers),
            }
            updated[existing] = nextItems[existing]
            return {
              items: updated,
              appliedCombos: computeAppliedCombos(nextItems, state.comboPromotions),
            }
          }
          const nextItems = [
            ...state.items,
            {
              cartItemId,
              product,
              quantity,
              selectedModifiers: normalizedModifiers,
              notes: normalizedNotes,
              lineTotal,
            },
          ]
          return {
            items: nextItems,
            appliedCombos: computeAppliedCombos(nextItems, state.comboPromotions),
          }
        })
      },

      removeItem: (cartItemId) =>
        set((state) => {
          const nextItems = state.items.filter((item) => resolveCartItemId(item) !== cartItemId)
          return {
            items: nextItems,
            appliedCombos: computeAppliedCombos(nextItems, state.comboPromotions),
          }
        }),

      updateQuantity: (cartItemId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            const nextItems = state.items.filter((item) => resolveCartItemId(item) !== cartItemId)
            return {
              items: nextItems,
              appliedCombos: computeAppliedCombos(nextItems, state.comboPromotions),
            }
          }
          const nextItems = state.items.map((i) =>
            resolveCartItemId(i) === cartItemId
              ? {
                  ...i,
                  cartItemId: resolveCartItemId(i),
                  quantity,
                  lineTotal: computeLineTotal(i.product, quantity, i.selectedModifiers),
                }
              : i
          )
          return {
            items: nextItems,
            appliedCombos: computeAppliedCombos(nextItems, state.comboPromotions),
          }
        }),

      clearCart: () =>
        set({ items: [], appliedPromotion: null, appliedCombos: [], promoError: null }),

      applyPromotion: (promo) =>
        set({ appliedPromotion: promo, promoError: null }),

      removePromotion: () =>
        set({ appliedPromotion: null, promoError: null }),

      setComboPromotions: (comboPromotions) =>
        set((state) => ({
          comboPromotions,
          appliedCombos: computeAppliedCombos(state.items, comboPromotions),
        })),

      loadComboPromotions: async () => {
        try {
          const comboPromotions = await fetchActiveComboPromotions()
          set((state) => ({
            comboPromotions,
            appliedCombos: computeAppliedCombos(state.items, comboPromotions),
          }))
        } catch (error) {
          console.error('Failed to load combo promotions:', error)
        }
      },

      setPromoError: (error) => set({ promoError: error }),

      // Single query — fetches all 3 config keys at once, called only on mount
      loadDeliveryFee: async () => {
        try {
          const { data, error } = await supabase
            .from('system_config')
            .select('key, value')
            .in('key', ['delivery_fee', 'free_delivery_enabled', 'free_delivery_min_order'])

          if (error) throw error

          const config = Object.fromEntries(
            asRows<SystemConfigRow>(data).map((row) => [row.key, row.value])
          )

          const freeDeliveryEnabled = config.free_delivery_enabled === 'true'

          set({
            deliveryFeeValue: config.delivery_fee
              ? Number(config.delivery_fee)
              : DELIVERY_FEE,
            systemConfig: {
              freeDeliveryEnabled: freeDeliveryEnabled,
              freeDeliveryMinOrder: Number(config.free_delivery_min_order ?? 0),
            },
          })
        } catch (err) {
          console.error('Failed to load delivery config:', err)
        }
      },

      // Initialize delivery fee on mount if not loaded
      initializeDeliveryFee: async () => {
        const { deliveryFeeValue } = get()
        if (deliveryFeeValue === undefined || deliveryFeeValue === DELIVERY_FEE) {
          await get().loadDeliveryFee()
        }
      },

      // Product selection setters
      setSelectedProduct: (product: Product | null) => set({ selectedProduct: product }),
      setQuantity: (quantity: number) => set({ quantity }),
      setModifiers: (modifiers: Record<string, string[]>) => set({ modifiers }),
      setNotes: (notes: string) => set({ notes }),
    }),
    {
      name: 'rms-cart',
      storage: createCartPartitionPersistStorage(),
      partialize: (state) => ({
        items: state.items,
        appliedPromotion: state.appliedPromotion,
        appliedCombos: state.appliedCombos,
        deliveryFeeValue: state.deliveryFeeValue,
        systemConfig: state.systemConfig,
      }),
    }
  )
)