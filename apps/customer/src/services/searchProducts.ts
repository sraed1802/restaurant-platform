import { supabase } from '../lib/supabase'
import type { ProductWithModifiers } from '../components/menu/types'
import type { ModifierGroup, ModifierOption, Product } from '../../types'

function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, ' ')
}

export async function searchProducts(query: string): Promise<ProductWithModifiers[]> {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return []

  const searchTerm = normalizedQuery.replace(/[^\w\s\u0600-\u06FF-]/g, ' ').trim()
  const slugQuery = searchTerm.split(' ').map((token) => `${token}:*`).join(' & ')

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      *,
      product_modifier_groups (
        display_order,
        modifier_groups (
          *,
          modifier_options (*)
        )
      )
    `)
    .eq('is_available', true)
    .textSearch('search_vector', slugQuery, { config: 'english' })
    .order('display_order')

  if (error) {
    console.warn('searchProducts.textSearch failed, falling back to ilike', error)
    const safeQuery = `%${normalizedQuery.replace(/%/g, '\\%')}%`
    const { data: fallbackProducts } = await supabase
      .from('products')
      .select(`
        *,
        product_modifier_groups (
          display_order,
          modifier_groups (
            *,
            modifier_options (*)
          )
        )
      `)
      .eq('is_available', true)
      .or(
        `name_en.ilike.${safeQuery},name_ar.ilike.${safeQuery},description_en.ilike.${safeQuery},description_ar.ilike.${safeQuery}`
      )
      .order('display_order')

    return processProducts(fallbackProducts ?? [])
  }

  return processProducts(products ?? [])
}

interface ProductModifierGroupJoinRow {
  display_order: number
  modifier_groups: (ModifierGroup & { modifier_options?: ModifierOption[] | null }) | null
}

interface ProductSearchRow extends Product {
  product_modifier_groups?: ProductModifierGroupJoinRow[] | null
}

function processProducts(rows: ProductSearchRow[]): ProductWithModifiers[] {
  return rows.map((product) => ({
    ...product,
    modifier_groups: [...(product.product_modifier_groups ?? [])]
      .sort((a, b) => a.display_order - b.display_order)
      .flatMap((productModifierGroup) => {
        const modifierGroup = productModifierGroup.modifier_groups
        if (!modifierGroup) return []

        return [{
          ...modifierGroup,
          options: [...(modifierGroup.modifier_options ?? [])].sort(
            (a, b) => a.display_order - b.display_order
          ),
        }]
      }),
  }))
}
