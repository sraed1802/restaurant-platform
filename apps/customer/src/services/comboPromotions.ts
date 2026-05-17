import type {
  ComboPromotion,
  ComboPromotionItem,
  ComboItemRole,
  ModifierGroup,
  ModifierOption,
} from '../../types'
import type { ProductWithModifiers } from '../components/menu/types'
import { supabase } from '../lib/supabase'

type RawModifierGroup = ModifierGroup & {
  modifier_options: ModifierOption[]
}

type RawProductModifierGroup = {
  display_order: number
  modifier_groups: RawModifierGroup
}

type RawComboProduct = ProductWithModifiers & {
  product_modifier_groups?: RawProductModifierGroup[]
}

type RawComboItem = Omit<ComboPromotionItem, 'product' | 'item_role'> & {
  item_role: ComboItemRole
  product: RawComboProduct | null
}

type RawComboPromotion = Omit<ComboPromotion, 'items'> & {
  items: RawComboItem[]
}

function normalizeProduct(product: RawComboProduct | null): ProductWithModifiers | undefined {
  if (!product) return undefined

  return {
    ...product,
    modifier_groups: (product.product_modifier_groups ?? [])
      .sort((a, b) => a.display_order - b.display_order)
      .map((group) => ({
        ...group.modifier_groups,
        options: [...group.modifier_groups.modifier_options].sort(
          (a, b) => a.display_order - b.display_order
        ),
      })),
  }
}

function normalizeCombo(row: RawComboPromotion): ComboPromotion {
  return {
    ...row,
    items: [...row.items]
      .sort((a, b) => a.display_order - b.display_order)
      .map((item) => ({
        ...item,
        product: normalizeProduct(item.product),
      })),
  }
}

export async function fetchActiveComboPromotions(options?: {
  featuredOnly?: boolean
}): Promise<ComboPromotion[]> {
  const nowIso = new Date().toISOString()
  let query = supabase
    .from('combo_promotions')
    .select(`
      *,
      items:combo_promotion_items (
        *,
        product:products (
          *,
          product_modifier_groups (
            display_order,
            modifier_groups (
              *,
              modifier_options (*)
            )
          )
        )
      )
    `)
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('display_order', { ascending: true })

  if (options?.featuredOnly) {
    query = query.eq('is_featured', true)
  }

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as RawComboPromotion[]).map(normalizeCombo)
}

export function buildDefaultSelectedModifiers(
  product: ProductWithModifiers
): Record<string, string[]> {
  const selected: Record<string, string[]> = {}

  for (const group of product.modifier_groups ?? []) {
    const available = group.options.filter((option) => option.is_available)
    if (available.length === 0) continue

    const defaults = available.filter((option) => option.is_default)

    if (group.selection_type === 'single') {
      const chosen = defaults[0] ?? (group.is_required ? available[0] : undefined)
      if (chosen) selected[group.id] = [chosen.id]
      continue
    }

    if (defaults.length > 0) {
      selected[group.id] = defaults.map((option) => option.id)
      continue
    }

    if (group.is_required) {
      selected[group.id] = available.slice(0, Math.max(1, group.min_selections)).map((option) => option.id)
    }
  }

  return selected
}

export function canAutoBuildCombo(combo: ComboPromotion): boolean {
  return (combo.items ?? []).every((item) => {
    if (!item.product) return false

    const selected = buildDefaultSelectedModifiers(item.product)
    return (item.product.modifier_groups ?? []).every((group) => {
      if (!group.is_required) return true
      return (selected[group.id] ?? []).length >= Math.max(1, group.min_selections)
    })
  })
}
