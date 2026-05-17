import { supabase } from '../lib/supabase'
import { asMaybeRow, asMutationArg, asMutationRowsArg } from '../lib/supabaseTypeWorkarounds'

export type ComboItemRole = 'main' | 'side' | 'drink' | 'dessert' | 'optional_drink'

export interface ComboCatalogProduct {
  id: string
  category_id: string
  name_en: string
  name_ar: string
  base_price: number
  image_url: string | null
  category: {
    id: string
    name_en: string
    name_ar: string
  } | null
}

export interface ComboCatalogCategory {
  id: string
  name_en: string
  name_ar: string
}

type RawComboCatalogProduct = Omit<ComboCatalogProduct, 'category'> & {
  category: Array<NonNullable<ComboCatalogProduct['category']>>
}

export interface ComboPromotionItemRecord {
  id: string
  combo_promotion_id: string
  product_id: string
  item_role: ComboItemRole
  quantity: number
  display_order: number
  product: ComboCatalogProduct | null
}

export interface ComboPromotionRecord {
  id: string
  name_en: string
  name_ar: string
  headline_en: string | null
  headline_ar: string | null
  description_en: string | null
  description_ar: string | null
  promo_price: number
  original_price: number
  image_url: string | null
  model_asset_url: string | null
  badge_text_en: string | null
  badge_text_ar: string | null
  accent_color: string | null
  secondary_color: string | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  is_featured: boolean
  display_order: number
  items: ComboPromotionItemRecord[]
}

export interface ComboPromotionMutation {
  name_en: string
  name_ar: string
  headline_en: string | null
  headline_ar: string | null
  description_en: string | null
  description_ar: string | null
  promo_price: number
  original_price: number
  image_url: string | null
  model_asset_url: string | null
  badge_text_en: string | null
  badge_text_ar: string | null
  accent_color: string | null
  secondary_color: string | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  is_featured: boolean
  display_order: number
  items: Array<{
    product_id: string
    item_role: ComboItemRole
    quantity: number
    display_order: number
  }>
}

type RawComboPromotion = Omit<ComboPromotionRecord, 'items'> & {
  items: Array<Omit<ComboPromotionItemRecord, 'product'> & { product: RawComboCatalogProduct | null }>
}

function normalizeProduct(product: RawComboCatalogProduct | null): ComboCatalogProduct | null {
  if (!product) return null
  return {
    ...product,
    category: product.category[0] ?? null,
  }
}

function normalizeCombo(row: RawComboPromotion): ComboPromotionRecord {
  return {
    ...row,
    items: [...(row.items ?? [])]
      .sort((a, b) => a.display_order - b.display_order)
      .map((item) => ({
        ...item,
        product: normalizeProduct(item.product),
      })),
  }
}

export async function listComboPromotions(): Promise<ComboPromotionRecord[]> {
  const { data, error } = await supabase
    .from('combo_promotions')
    .select(`
      *,
      items:combo_promotion_items (
        *,
        product:products (
          id,
          category_id,
          name_en,
          name_ar,
          base_price,
          image_url,
          category:categories!products_category_id_fkey (
            id,
            name_en,
            name_ar
          )
        )
      )
    `)
    .order('display_order', { ascending: true })
    .order('display_order', { ascending: true, referencedTable: 'combo_promotion_items' })

  if (error) throw error
  return ((data ?? []) as RawComboPromotion[]).map(normalizeCombo)
}

export async function fetchComboPromotionById(comboId: string): Promise<ComboPromotionRecord | null> {
  const { data, error } = await supabase
    .from('combo_promotions')
    .select(`
      *,
      items:combo_promotion_items (
        *,
        product:products (
          id,
          category_id,
          name_en,
          name_ar,
          base_price,
          image_url,
          category:categories!products_category_id_fkey (
            id,
            name_en,
            name_ar
          )
        )
      )
    `)
    .eq('id', comboId)
    .order('display_order', { ascending: true, referencedTable: 'combo_promotion_items' })
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return normalizeCombo(data as RawComboPromotion)
}

export async function listComboCatalogCategories(): Promise<ComboCatalogCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name_en, name_ar')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as ComboCatalogCategory[]
}

export async function listComboCatalogProducts(): Promise<ComboCatalogProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      category_id,
      name_en,
      name_ar,
      base_price,
      image_url,
      is_available,
      category:categories!products_category_id_fkey (
        id,
        name_en,
        name_ar
      )
    `)
    .order('name_en', { ascending: true })

  if (error) throw error
  return ((data ?? []) as RawComboCatalogProduct[]).map(normalizeProduct).filter(
    (product): product is ComboCatalogProduct => product !== null
  )
}

async function replaceComboItems(comboId: string, items: ComboPromotionMutation['items']) {
  const { error: deleteError } = await supabase
    .from('combo_promotion_items')
    .delete()
    .eq('combo_promotion_id', comboId)

  if (deleteError) throw deleteError

  if (items.length === 0) return

  const { error: insertError } = await supabase.from('combo_promotion_items').insert(
    asMutationRowsArg(items.map((item, index) => ({
      combo_promotion_id: comboId,
      product_id: item.product_id,
      item_role: item.item_role,
      quantity: item.quantity,
      display_order: item.display_order ?? index,
    })))
  )

  if (insertError) throw insertError
}

export async function createComboPromotion(
  input: ComboPromotionMutation
): Promise<ComboPromotionRecord> {
  const { data, error } = await supabase
    .from('combo_promotions')
    .insert(asMutationRowsArg([{
      name_en: input.name_en,
      name_ar: input.name_ar,
      headline_en: input.headline_en,
      headline_ar: input.headline_ar,
      description_en: input.description_en,
      description_ar: input.description_ar,
      promo_price: input.promo_price,
      original_price: input.original_price,
      image_url: input.image_url,
      model_asset_url: input.model_asset_url,
      badge_text_en: input.badge_text_en,
      badge_text_ar: input.badge_text_ar,
      accent_color: input.accent_color,
      secondary_color: input.secondary_color,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      is_active: input.is_active,
      is_featured: input.is_featured,
      display_order: input.display_order,
    }]))
    .select('id')
    .single()

  const createdCombo = asMaybeRow<{ id: string }>(data)
  if (error || !createdCombo) throw error ?? new Error('Failed to create combo promotion')

  await replaceComboItems(createdCombo.id, input.items)
  const combos = await listComboPromotions()
  const combo = combos.find((record) => record.id === createdCombo.id)
  if (!combo) throw new Error('Created combo could not be reloaded')
  return combo
}

export async function updateComboPromotion(
  comboId: string,
  input: ComboPromotionMutation
): Promise<ComboPromotionRecord> {
  const { error } = await supabase
    .from('combo_promotions')
    .update(asMutationArg({
      name_en: input.name_en,
      name_ar: input.name_ar,
      headline_en: input.headline_en,
      headline_ar: input.headline_ar,
      description_en: input.description_en,
      description_ar: input.description_ar,
      promo_price: input.promo_price,
      original_price: input.original_price,
      image_url: input.image_url,
      model_asset_url: input.model_asset_url,
      badge_text_en: input.badge_text_en,
      badge_text_ar: input.badge_text_ar,
      accent_color: input.accent_color,
      secondary_color: input.secondary_color,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      is_active: input.is_active,
      is_featured: input.is_featured,
      display_order: input.display_order,
    }))
    .eq('id', comboId)

  if (error) throw error

  await replaceComboItems(comboId, input.items)
  const combos = await listComboPromotions()
  const combo = combos.find((record) => record.id === comboId)
  if (!combo) throw new Error('Updated combo could not be reloaded')
  return combo
}

export async function deleteComboPromotion(comboId: string): Promise<void> {
  const { error } = await supabase.from('combo_promotions').delete().eq('id', comboId)
  if (error) throw error
}

export async function toggleComboPromotion(
  comboId: string,
  is_active: boolean
): Promise<void> {
  const { error } = await supabase
    .from('combo_promotions')
    .update(asMutationArg({ is_active }))
    .eq('id', comboId)

  if (error) throw error
}
