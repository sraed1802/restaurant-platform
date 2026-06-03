import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category, ComboPromotion, ModifierGroup, ModifierOption, Product, Promotion } from '../../types'
import { supabase } from '../lib/supabase'
import type { PromotionRow } from '../lib/menuPromotions'
import { useCartStore } from '../store/cartStore'
import { useSessionStore } from '../store/sessionStore'
import type { ProductWithModifiers } from '../components/menu/types'
import { fetchActiveComboPromotions } from '../services/comboPromotions'
import {
  fetchCustomerPromotionContext,
  filterPromotionsForCustomer,
} from '../services/promotionEligibility'

interface ProductModifierGroupJoinRow {
  display_order: number
  modifier_groups: (ModifierGroup & { modifier_options?: ModifierOption[] | null }) | null
}

interface ProductCatalogRow extends Product {
  product_modifier_groups?: ProductModifierGroupJoinRow[] | null
}

interface AiSuggestionCacheRow {
  suggestion_payload?: {
    ranked_products?: Array<{ product_id: string }>
  } | null
}

interface PromotionSummaryRow {
  id: string
  valid_from: string | null
  valid_until: string | null
  valid_from_time: string | null
  valid_until_time: string | null
}

interface PromotionProductRow {
  product_id: string
  promotion_id: string
}

export function useMenuCatalog() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Record<string, ProductWithModifiers[]>>({})
  const [aiRanking, setAiRanking] = useState<Map<string, number>>(new Map())
  const [featuredPromos, setFeaturedPromos] = useState<PromotionRow[]>([])
  const [featuredCombos, setFeaturedCombos] = useState<ComboPromotion[]>([])
  const [promotionalProductIds, setPromotionalProductIds] = useState<Set<string>>(new Set())
  const [activePromotions, setActivePromotions] = useState<PromotionRow[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const selectedCategoryRef = useRef('')
  const phone = useSessionStore((state) => state.phone)
  const customerId = useSessionStore((state) => state.customerId)
  const [customerPromotionContext, setCustomerPromotionContext] = useState({
    hasPlacedOrder: false,
  })
  const [promotionContextLoaded, setPromotionContextLoaded] = useState(false)

  useEffect(() => {
    selectedCategoryRef.current = selectedCategory
  }, [selectedCategory])

  useEffect(() => {
    let cancelled = false

    async function loadCustomerPromotionContext() {
      setPromotionContextLoaded(false)
      try {
        const context = await fetchCustomerPromotionContext(phone)
        if (!cancelled) {
          setCustomerPromotionContext(context)
        }
      } catch (error) {
        console.error('Failed to load promotion eligibility:', error)
        if (!cancelled) {
          setCustomerPromotionContext({ hasPlacedOrder: false })
        }
      } finally {
        if (!cancelled) {
          setPromotionContextLoaded(true)
        }
      }
    }

    void loadCustomerPromotionContext()

    return () => {
      cancelled = true
    }
  }, [customerId, phone])

  const loadMenu = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const { data: cats, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order')

      if (categoriesError) {
        console.error('Failed to load menu categories:', categoriesError)
        setLoadError(categoriesError.message)
        return
      }

      const categoryRows = (cats ?? []) as Category[]

      if (!categoryRows.length) {
        return
      }

      const { data: prods, error: productsError } = await supabase
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
        .order('display_order')

      if (productsError) {
        console.error('Failed to load menu products:', productsError)
        setLoadError(productsError.message)
        return
      }

      const productRows = (prods ?? []) as ProductCatalogRow[]
      const grouped: Record<string, ProductWithModifiers[]> = {}
      for (const cat of categoryRows) {
        grouped[cat.id] = []
      }
      for (const product of productRows) {
        const categoryProducts = grouped[product.category_id]
        if (!categoryProducts) continue

        categoryProducts.push({
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
        })
      }

      for (const catId in grouped) {
        grouped[catId].sort((a, b) => a.display_order - b.display_order)
      }

      const visibleCategories = categoryRows.filter((cat) => grouped[cat.id]?.length > 0)
      const visibleCategoryIds = new Set(visibleCategories.map((cat) => cat.id))
      const visibleProducts = Object.fromEntries(
        Object.entries(grouped).filter(([catId]) => visibleCategoryIds.has(catId))
      ) as Record<string, ProductWithModifiers[]>

      setCategories(visibleCategories)
      setSelectedCategory(visibleCategories[0]?.id ?? '')
      setProducts(visibleProducts)
      if (!visibleCategories.length) {
        setLoadError('No menu items are available right now.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  async function loadAiSuggestions() {
    const { data } = await supabase
      .from('ai_suggestion_cache')
      .select('suggestion_payload')
      .eq('cache_key', 'global_menu_rank')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    const suggestionRow = data as AiSuggestionCacheRow | null

    if (suggestionRow?.suggestion_payload?.ranked_products) {
      const rankMap = new Map<string, number>()
      suggestionRow.suggestion_payload.ranked_products.forEach(
        (item: { product_id: string }, idx: number) => {
          rankMap.set(item.product_id, idx)
        }
      )
      setAiRanking(rankMap)
    }
  }

  const applyAutomaticPromotions = useCallback(async () => {
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 8)

    const { data: activePromos } = await supabase
      .from('promotions')
      .select('*')
      .or('valid_until.is.null,valid_until.gt.' + now.toISOString())
      .lt('valid_from', now.toISOString())
      .or('valid_from_time.is.null,valid_from_time.lte.' + currentTime)
      .or('valid_until_time.is.null,valid_until_time.gte.' + currentTime)
      .order('ai_rank_score', { ascending: false })

    const rows = filterPromotionsForCustomer(
      (activePromos ?? []) as PromotionRow[],
      customerPromotionContext
    )
    setActivePromotions(rows)

    const { appliedPromotion, removePromotion } = useCartStore.getState()
    if (customerPromotionContext.hasPlacedOrder && appliedPromotion?.condition_type === 'first_order') {
      removePromotion()
    }

    if (!rows.length) return

    const bestPromo = rows.find((promo) => {
      if (promo.condition_type === 'first_order') return true
      if (promo.condition_type === 'min_order') {
        const subtotal = useCartStore.getState().subtotal()
        return subtotal >= promo.min_order_value
      }
      if (promo.condition_type === 'specific_categories') {
        const sel = selectedCategoryRef.current
        return Boolean(sel && promo.category_ids?.includes(sel))
      }
      if (promo.condition_type === 'specific_products') {
        const cartItems = useCartStore.getState().items
        return cartItems.some((item) => promo.product_ids?.includes(item.product.id))
      }
      if (promo.condition_type === 'none') return true
      return false
    })

    if (bestPromo) {
      useCartStore.getState().applyPromotion(bestPromo as Promotion)
    }
  }, [customerPromotionContext])

  const loadFeaturedPromotions = useCallback(async () => {
    const now = new Date()

    const { data: featured } = await supabase
      .from('promotions')
      .select('*')
      .eq('is_featured', true)
      .or('valid_until.is.null,valid_until.gt.' + now.toISOString())
      .or('valid_from.is.null,valid_from.lte.' + now.toISOString())
      .order('created_at', { ascending: false })
      .limit(3)

    setFeaturedPromos(
      filterPromotionsForCustomer((featured ?? []) as PromotionRow[], customerPromotionContext)
    )

    const { data: activePromos } = await supabase
      .from('promotions')
      .select('id, valid_from, valid_until, valid_from_time, valid_until_time, condition_type')
      .or('valid_until.is.null,valid_until.gt.' + now.toISOString())
      .or('valid_from.is.null,valid_from.lte.' + now.toISOString())

    const promoSummaryRows = filterPromotionsForCustomer(
      (activePromos ?? []) as Array<PromotionSummaryRow & { condition_type?: string | null }>,
      customerPromotionContext
    )

    if (promoSummaryRows.length > 0) {
      const { data: promoProducts, error: productError } = await supabase
        .from('promotion_products')
        .select('product_id, promotion_id')
        .in(
          'promotion_id',
          promoSummaryRows.map((promo) => promo.id)
        )

      if (productError) {
        console.error('Error loading promotional products:', productError)
        return
      }

      const promoProductRows = (promoProducts ?? []) as PromotionProductRow[]
      const promoIds = new Set(promoProductRows.map((promoProduct) => promoProduct.product_id))
      setPromotionalProductIds(promoIds)
    } else {
      setPromotionalProductIds(new Set())
    }

    await applyAutomaticPromotions()
  }, [applyAutomaticPromotions, customerPromotionContext])

  const loadFeaturedCombos = useCallback(async () => {
    try {
      const combos = await fetchActiveComboPromotions()
      useCartStore.getState().setComboPromotions(combos)
      setFeaturedCombos(
        combos
          .filter((combo) => combo.is_featured)
          .sort((a, b) => a.display_order - b.display_order)
          .slice(0, 3)
      )
    } catch (error) {
      console.error('Failed to load combo promotions:', error)
      setFeaturedCombos([])
    }
  }, [])

  useEffect(() => {
    void loadMenu()
    void loadAiSuggestions()
    void loadFeaturedCombos()
    useCartStore.getState().loadDeliveryFee()
  }, [loadMenu, loadFeaturedCombos])

  useEffect(() => {
    if (!promotionContextLoaded) return
    void loadFeaturedPromotions()
  }, [promotionContextLoaded, loadFeaturedPromotions])

  return {
    categories,
    products,
    setProducts,
    aiRanking,
    featuredPromos,
    featuredCombos,
    promotionalProductIds,
    activePromotions,
    selectedCategory,
    setSelectedCategory,
    loading,
    loadError,
    reloadMenu: loadMenu,
    loadFeaturedPromotions,
    applyAutomaticPromotions,
  }
}
