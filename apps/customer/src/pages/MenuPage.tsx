import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ImpactStyle } from '@capacitor/haptics'
import { triggerHapticImpact } from '../lib/hapticFeedback'
import { useNavigate } from 'react-router-dom'
import { useFeatureFlag } from '@rms/platform'
import { useCartStore } from '../store/cartStore'
import { useSessionStore } from '../store/sessionStore'
import { useNativeCartFeedbackStore } from '../store/nativeCartFeedbackStore'
import { useRestaurantSettings } from '../hooks/useRestaurantSettings'
import { useOrderAvailability } from '../hooks/useOrderAvailability'
import { useMenuCatalog } from '../hooks/useMenuCatalog'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { calculatePromotionalPrice } from '../lib/menuPromotions'
import { DIETARY_FILTERS, productMatchesDietary } from '../lib/dietaryTags'
import { searchProducts } from '../services/searchProducts'
import SkeletonCard from '../components/SkeletonCard'
import { NativeCustomerLoading } from '../components/NativeCustomerLoading'
import { MenuHero } from '../components/menu/MenuHero'
import { isAdminEmbedPreview } from '../lib/embedPreview'
import { isNativeCustomerApp } from '../lib/nativeCustomerShell'
import { MenuComboShowcase } from '../components/menu/MenuComboShowcase'
import { ProductCard } from '../components/menu/ProductCard'
import { ProductDetailSheet } from '../components/menu/ProductDetailSheet'
import { SettingsSlidersIcon } from '../components/Icons'
import type { ProductWithModifiers } from '../components/menu/types'
import type { ComboPromotion } from '../../types'
import { buildDefaultSelectedModifiers, canAutoBuildCombo } from '../services/comboPromotions'
import './menu-page.css'

function ServiceModeStrip({
  dineIn,
  takeaway,
  delivery,
  language,
}: {
  dineIn: boolean
  takeaway: boolean
  delivery: boolean
  language: string
}) {
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const modes = [
    { show: dineIn, en: 'Dine in', ar: 'في المطعم' },
    { show: takeaway, en: 'Takeaway', ar: 'سفري' },
    { show: delivery, en: 'Delivery', ar: 'توصيل' },
  ].filter((m) => m.show)

  if (modes.length === 0) return null

  return (
    <div className="service-mode-strip">
      <span className="service-mode-strip-label">{t('Service', 'الخدمة')}</span>
      {modes.map((m) => (
        <span key={m.en} className="service-mode-pill">
          {t(m.en, m.ar)}
        </span>
      ))}
    </div>
  )
}

export default function MenuPage() {
  const {
    categories,
    products,
    aiRanking,
    featuredPromos,
    featuredCombos,
    promotionalProductIds,
    activePromotions,
    selectedCategory,
    setSelectedCategory,
    loading,
  } = useMenuCatalog()

  const [selectedProduct, setSelectedProduct] = useState<ProductWithModifiers | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebouncedValue(searchQuery, 280)
  const [priceFilter, setPriceFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [prepTimeFilter, setPrepTimeFilter] = useState<'all' | 'quick' | 'medium' | 'long'>('all')
  const [sortBy, setSortBy] = useState<'order' | 'price-low' | 'price-high' | 'prep-time' | 'popular'>('order')
  const [dietaryFilters, setDietaryFilters] = useState<Set<string>>(new Set())
  const [searchResults, setSearchResults] = useState<Record<string, ProductWithModifiers[]> | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({})
  const categoryRailRef = useRef<HTMLDivElement | null>(null)
  const { language, addCategoryView } = useSessionStore()
  const addItem = useCartStore((s) => s.addItem)
  const navigate = useNavigate()
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [nativeFilterOpen, setNativeFilterOpen] = useState(false)
  const { settings: restaurantSettings } = useRestaurantSettings()
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false)
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false)
  const advancedSearchEnabled = useFeatureFlag('advancedSearch')
  const { status: orderAvailabilityStatus, isOrderable } = useOrderAvailability()

  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const nativeUi = isNativeCustomerApp()
  const prefersReducedMotion = usePrefersReducedMotion()
  const nativeFiltersActive =
    dietaryFilters.size > 0 || priceFilter !== 'all' || prepTimeFilter !== 'all' || sortBy !== 'order'

  const currencyLabel = useMemo(() => restaurantSettings.currency_code || 'QAR', [restaurantSettings.currency_code])
  const closedMessage = useMemo(() => {
    const baseMessage = language === 'ar'
      ? (orderAvailabilityStatus.public_message_ar || 'الطلبات مغلقة حالياً.')
      : (orderAvailabilityStatus.public_message_en || 'Orders are currently closed.')

    if (!orderAvailabilityStatus.next_open_at) return baseMessage

    const nextOpenLabel = new Date(orderAvailabilityStatus.next_open_at).toLocaleString(
      language === 'ar' ? 'ar-QA' : 'en-US',
      {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    )

    return `${baseMessage} ${t('Opens again:', 'يفتح مجدداً:')} ${nextOpenLabel}`
  }, [language, orderAvailabilityStatus.next_open_at, orderAvailabilityStatus.public_message_ar, orderAvailabilityStatus.public_message_en])

  function formatPrice(price: number) {
    return `${currencyLabel} ${price.toFixed(2)}`
  }

  const catalogProducts = searchResults ?? products
  const visibleCategories = searchResults
    ? categories.filter((cat) => (searchResults[cat.id]?.length ?? 0) > 0)
    : categories

  /** Native app: show one category at a time from the dropdown (full menu when search is active). */
  const menuBodyCategories = useMemo(() => {
    if (!nativeUi) return visibleCategories
    const searchOn = debouncedSearch.trim().length >= 3
    if (searchOn) return visibleCategories
    const match = visibleCategories.find((c) => c.id === selectedCategory)
    if (match) return [match]
    return visibleCategories.length > 0 ? [visibleCategories[0]] : []
  }, [nativeUi, visibleCategories, selectedCategory, debouncedSearch])

  function toggleDietary(key: string) {
    setDietaryFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function notifyCartAddedLabel(label: string) {
    if (!isNativeCustomerApp()) return
    useNativeCartFeedbackStore.getState().showCartAdded(label)
  }

  function notifyCartAddedProduct(product: ProductWithModifiers) {
    const label = language === 'ar' && product.name_ar ? product.name_ar : product.name_en
    notifyCartAddedLabel(label)
  }

  function filterAndSortProducts(categoryProducts: ProductWithModifiers[]): ProductWithModifiers[] {
    let filtered = [...categoryProducts]

    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        (product) =>
          product.name_en.toLowerCase().includes(query) ||
          product.name_ar.toLowerCase().includes(query) ||
          product.description_en?.toLowerCase().includes(query) ||
          product.description_ar?.toLowerCase().includes(query) ||
          product.tags?.some((tag: string) => tag.toLowerCase().includes(query))
      )
    }

    filtered = filtered.filter((p) => productMatchesDietary(p.tags, dietaryFilters))

    if (priceFilter !== 'all') {
      filtered = filtered.filter((product) => {
        const price = calculatePromotionalPrice(product, activePromotions)
        switch (priceFilter) {
          case 'low':
            return price < 20
          case 'medium':
            return price >= 20 && price < 50
          case 'high':
            return price >= 50
          default:
            return true
        }
      })
    }

    if (prepTimeFilter !== 'all') {
      filtered = filtered.filter((product) => {
        switch (prepTimeFilter) {
          case 'quick':
            return product.prep_time_minutes <= 15
          case 'medium':
            return product.prep_time_minutes > 15 && product.prep_time_minutes <= 30
          case 'long':
            return product.prep_time_minutes > 30
          default:
            return true
        }
      })
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return calculatePromotionalPrice(a, activePromotions) - calculatePromotionalPrice(b, activePromotions)
        case 'price-high':
          return calculatePromotionalPrice(b, activePromotions) - calculatePromotionalPrice(a, activePromotions)
        case 'prep-time':
          return a.prep_time_minutes - b.prep_time_minutes
        case 'popular': {
          const aRank = aiRanking.get(a.id) ?? 0
          const bRank = aiRanking.get(b.id) ?? 0
          return bRank - aRank
        }
        case 'order':
        default: {
          if (a.is_featured && !b.is_featured) return -1
          if (!a.is_featured && b.is_featured) return 1
          return a.display_order - b.display_order
        }
      }
    })

    return filtered
  }

  function scrollToCategory(catId: string) {
    triggerHapticImpact(ImpactStyle.Light)
    setSelectedCategory(catId)
    addCategoryView(catId)
    if (nativeUi) {
      requestAnimationFrame(() => {
        document.querySelector('.native-app-main')?.scrollTo({ top: 0, behavior: 'smooth' })
      })
      return
    }
    categoryRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function updateCategoryRailControls() {
    const rail = categoryRailRef.current
    if (!rail) return

    setCanScrollCategoriesLeft(rail.scrollLeft > 8)
    setCanScrollCategoriesRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 8)
  }

  function scrollCategoryRail(direction: 'left' | 'right') {
    const rail = categoryRailRef.current
    if (!rail) return

    rail.scrollBy({
      left: direction === 'left' ? -240 : 240,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateCategoryRailControls()
    })

    const rail = categoryRailRef.current
    if (!rail) {
      return () => window.cancelAnimationFrame(rafId)
    }

    const resizeObserver = new ResizeObserver(() => {
      updateCategoryRailControls()
    })
    resizeObserver.observe(rail)

    rail.addEventListener('scroll', updateCategoryRailControls, { passive: true })
    window.addEventListener('resize', updateCategoryRailControls)

    return () => {
      window.cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      rail.removeEventListener('scroll', updateCategoryRailControls)
      window.removeEventListener('resize', updateCategoryRailControls)
    }
  }, [categories.length])

  useEffect(() => {
    if (!nativeUi || !nativeFilterOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNativeFilterOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nativeUi, nativeFilterOpen])

  useEffect(() => {
    if (!nativeUi || !nativeFilterOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [nativeUi, nativeFilterOpen])

  useEffect(() => {
    let canceled = false

    const runSearch = async () => {
      const query = debouncedSearch.trim()
      if (!advancedSearchEnabled || query.length < 3) {
        setSearchResults(null)
        setSearchLoading(false)
        return
      }

      setSearchLoading(true)
      try {
        const results = await searchProducts(query)
        if (canceled) return

        const groupedResults = results.reduce<Record<string, ProductWithModifiers[]>>((acc, product) => {
          const bucket = acc[product.category_id] ?? []
          bucket.push(product)
          acc[product.category_id] = bucket
          return acc
        }, {})

        if (!canceled) {
          setSearchResults(groupedResults)
        }
      } catch (error) {
        console.error('Menu search failed:', error)
        if (!canceled) {
          setSearchResults(null)
        }
      } finally {
        if (!canceled) {
          setSearchLoading(false)
        }
      }
    }

    runSearch()

    return () => {
      canceled = true
    }
  }, [advancedSearchEnabled, debouncedSearch])

  function addComboToCart(combo: ComboPromotion) {
    if (!isOrderable || !canAutoBuildCombo(combo)) return

    for (const item of combo.items ?? []) {
      if (!item.product) continue
      addItem(item.product, item.quantity, buildDefaultSelectedModifiers(item.product), combo.name_en)
    }

    if (isNativeCustomerApp()) {
      notifyCartAddedLabel(t(combo.name_en, combo.name_ar))
      return
    }
    navigate('/cart')
  }

  useEffect(() => {
    if (!isAdminEmbedPreview()) return
    window.scrollTo(0, 0)
    document.querySelector('.enhanced-main')?.scrollTo(0, 0)
  }, [])

  if (loading) {
    if (isNativeCustomerApp()) {
      return <NativeCustomerLoading variant="menu" />
    }
    return (
      <div className="menu-page">
        <MenuHero settings={restaurantSettings} language={language} />
        <nav className="cat-nav">
          <div className="cat-nav-inner">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="cat-btn skeleton" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </nav>
        <div className="menu-body">
          <div className="product-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="menu-page">
      <MenuHero
        settings={restaurantSettings}
        language={language}
      />

      <MenuComboShowcase
        combos={featuredCombos}
        language={language}
        formatPrice={formatPrice}
        isOrderable={isOrderable}
        unavailableLabel={t('Ordering is closed', 'الطلبات متوقفة')}
        onAddCombo={addComboToCart}
      />

      {!isOrderable && (
        <div
          style={{
            margin: '0 auto 1rem',
            maxWidth: 'var(--container-wide)',
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(184, 151, 90, 0.35)',
            background: 'rgba(184, 151, 90, 0.12)',
            color: 'var(--ink)',
          }}
        >
          {closedMessage}
        </div>
      )}

      {!nativeUi ? (
        <ServiceModeStrip
          dineIn={restaurantSettings.enable_service_dine_in}
          takeaway={restaurantSettings.enable_service_takeaway}
          delivery={restaurantSettings.enable_service_delivery}
          language={language}
        />
      ) : null}

      {nativeUi ? (
        <div className="native-cat-bar">
          <label htmlFor="native-category-select" className="native-cat-label">
            {t('Category', 'القسم')}
          </label>
          <select
            id="native-category-select"
            className="native-cat-select"
            value={selectedCategory}
            onChange={(e) => scrollToCategory(e.target.value)}
            aria-label={language === 'ar' ? 'أقسام القائمة' : 'Menu sections'}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {t(cat.name_en, cat.name_ar)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <nav className="cat-nav" aria-label={language === 'ar' ? 'أقسام القائمة' : 'Menu sections'}>
          <div className="cat-nav-shell">
            <button
              type="button"
              className={`cat-nav-arrow ${canScrollCategoriesLeft ? '' : 'hidden'}`}
              onClick={() => scrollCategoryRail('left')}
              aria-label={t('Scroll categories left', 'تمرير الأقسام إلى اليسار')}
              disabled={!canScrollCategoriesLeft}
            >
              ‹
            </button>
            <div ref={categoryRailRef} className="cat-nav-inner">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => scrollToCategory(cat.id)}
                >
                  {t(cat.name_en, cat.name_ar)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`cat-nav-arrow ${canScrollCategoriesRight ? '' : 'hidden'}`}
              onClick={() => scrollCategoryRail('right')}
              aria-label={t('Scroll categories right', 'تمرير الأقسام إلى اليمين')}
              disabled={!canScrollCategoriesRight}
            >
              ›
            </button>
          </div>
        </nav>
      )}

      {nativeUi ? (
        <>
          <div className="native-menu-search-row">
            <label htmlFor="menu-search" className="visually-hidden">
              {t('Search menu', 'بحث في القائمة')}
            </label>
            <input
              id="menu-search"
              type="search"
              placeholder={t('Search menu…', 'بحث في القائمة…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="native-menu-search-input"
              autoComplete="off"
            />
            <button
              type="button"
              className="native-menu-filter-open"
              onClick={() => setNativeFilterOpen(true)}
              aria-expanded={nativeFilterOpen}
            >
              <span className="native-menu-filter-open-icon" aria-hidden>
                <SettingsSlidersIcon />
              </span>
              <span>{t('Filters', 'فلاتر')}</span>
              {nativeFiltersActive ? <span className="native-menu-filter-dot" aria-hidden /> : null}
            </button>
          </div>

          {nativeFilterOpen ? (
            <div className="native-menu-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="native-filter-title">
              <button
                type="button"
                className="native-menu-filter-backdrop"
                aria-label={t('Close filters', 'إغلاق الفلاتر')}
                onClick={() => setNativeFilterOpen(false)}
              />
              <div className="native-menu-filter-panel">
                <div className="native-menu-filter-head">
                  <h2 id="native-filter-title" className="native-menu-filter-title">
                    {t('Filters', 'فلاتر')}
                  </h2>
                  <button type="button" className="native-menu-filter-done" onClick={() => setNativeFilterOpen(false)}>
                    {t('Done', 'تم')}
                  </button>
                </div>
                <div className="native-menu-filter-body">
                  <p className="native-menu-filter-section-label">{t('Dietary preferences', 'التفضيلات الغذائية')}</p>
                  <div className="native-menu-dietary-wrap" role="group" aria-label={t('Dietary preferences', 'التفضيلات الغذائية')}>
                    {DIETARY_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`native-menu-dietary-chip ${dietaryFilters.has(f.key) ? 'active' : ''}`}
                        onClick={() => toggleDietary(f.key)}
                        aria-pressed={dietaryFilters.has(f.key)}
                      >
                        {t(f.en, f.ar)}
                      </button>
                    ))}
                  </div>

                  <label className="native-menu-filter-section-label" htmlFor="native-price-filter">
                    {t('Price', 'السعر')}
                  </label>
                  <select
                    id="native-price-filter"
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value as typeof priceFilter)}
                    className="native-menu-select"
                  >
                    <option value="all">{t('Any price', 'أي سعر')}</option>
                    <option value="low">{t('< 20', '< 20')}</option>
                    <option value="medium">{t('20–50', '20–50')}</option>
                    <option value="high">{t('50+', '50+')}</option>
                  </select>

                  <label className="native-menu-filter-section-label" htmlFor="native-prep-filter">
                    {t('Prep time', 'وقت التحضير')}
                  </label>
                  <select
                    id="native-prep-filter"
                    value={prepTimeFilter}
                    onChange={(e) => setPrepTimeFilter(e.target.value as typeof prepTimeFilter)}
                    className="native-menu-select"
                  >
                    <option value="all">{t('Any prep time', 'أي وقت')}</option>
                    <option value="quick">{t('≤15 min', '≤15 د')}</option>
                    <option value="medium">{t('15–30 min', '15–30 د')}</option>
                    <option value="long">{t('30+ min', '+30 د')}</option>
                  </select>

                  <label className="native-menu-filter-section-label" htmlFor="native-sort-filter">
                    {t('Sort', 'ترتيب')}
                  </label>
                  <select
                    id="native-sort-filter"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="native-menu-select"
                  >
                    <option value="order">{t('Featured', 'مميز')}</option>
                    <option value="popular">{t('Popular', 'شائع')}</option>
                    <option value="price-low">{t('Price ↑', 'سعر ↑')}</option>
                    <option value="price-high">{t('Price ↓', 'سعر ↓')}</option>
                    <option value="prep-time">{t('Prep time', 'وقت التحضير')}</option>
                  </select>

                  <button
                    type="button"
                    className="native-menu-filter-clear"
                    onClick={() => {
                      setDietaryFilters(new Set())
                      setPriceFilter('all')
                      setPrepTimeFilter('all')
                      setSortBy('order')
                    }}
                  >
                    {t('Clear all filters', 'مسح كل الفلاتر')}
                  </button>

                  <p className="native-menu-allergen-note">
                    {t(
                      'Allergen information is provided by the kitchen. Guests with severe allergies should speak with staff before ordering.',
                      'معلومات المواد المسببة للحساسية تقريبية. يُرجى التواصل مع الفريق في حالات الحساسية الشديدة.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="search-filters-section">
          <div className="search-compact">
            <label htmlFor="menu-search" className="visually-hidden">
              {t('Search menu', 'بحث في القائمة')}
            </label>
            <input
              id="menu-search"
              type="search"
              placeholder={t('Search menu…', 'بحث في القائمة…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input-compact"
              autoComplete="off"
            />
            <button
              type="button"
              className="filter-toggle-btn"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              aria-expanded={filtersExpanded}
            >
              <span className="filter-icon-wrap" aria-hidden>
                <SettingsSlidersIcon />
              </span>
              <span className="filter-label">{t('Filters', 'فلاتر')}</span>
              <span className={`chevron ${filtersExpanded ? 'open' : ''}`} aria-hidden>
                ▼
              </span>
            </button>
          </div>

          <div className="dietary-filter-row" role="group" aria-label={t('Dietary preferences', 'التفضيلات الغذائية')}>
            {DIETARY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`dietary-chip ${dietaryFilters.has(f.key) ? 'active' : ''}`}
                onClick={() => toggleDietary(f.key)}
                aria-pressed={dietaryFilters.has(f.key)}
              >
                {t(f.en, f.ar)}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-muted)', marginTop: '0.65rem', lineHeight: 1.45 }}>
            {t(
              'Allergen information is provided by the kitchen. Guests with severe allergies should speak with staff before ordering.',
              'معلومات المواد المسببة للحساسية تقريبية. يُرجى التواصل مع الفريق في حالات الحساسية الشديدة.'
            )}
          </p>

          {filtersExpanded && (
            <div className="filters-compact">
              <select
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.target.value as typeof priceFilter)}
                className="filter-select-compact"
                aria-label={t('Price filter', 'فلتر السعر')}
              >
                <option value="all">{t('Price', 'السعر')}</option>
                <option value="low">{t('< 20', '< 20')}</option>
                <option value="medium">{t('20–50', '20–50')}</option>
                <option value="high">{t('50+', '50+')}</option>
              </select>

              <select
                value={prepTimeFilter}
                onChange={(e) => setPrepTimeFilter(e.target.value as typeof prepTimeFilter)}
                className="filter-select-compact"
                aria-label={t('Prep time', 'وقت التحضير')}
              >
                <option value="all">{t('Prep time', 'وقت التحضير')}</option>
                <option value="quick">{t('≤15 min', '≤15 د')}</option>
                <option value="medium">{t('15–30 min', '15–30 د')}</option>
                <option value="long">{t('30+ min', '+30 د')}</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="filter-select-compact"
                aria-label={t('Sort', 'ترتيب')}
              >
                <option value="order">{t('Featured', 'مميز')}</option>
                <option value="popular">{t('Popular', 'شائع')}</option>
                <option value="price-low">{t('Price ↑', 'سعر ↑')}</option>
                <option value="price-high">{t('Price ↓', 'سعر ↓')}</option>
                <option value="prep-time">{t('Prep time', 'وقت التحضير')}</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="menu-body" id="menu-catalog">
        {debouncedSearch.trim().length >= 3 && !searchLoading && visibleCategories.length === 0 ? (
          <div className="empty-search-state">
            <p>{t('No items match your search. Try different keywords or filters.', 'لا يوجد عناصر تطابق البحث. حاول كلمات أو فلاتر مختلفة.')}</p>
          </div>
        ) : null}

        {menuBodyCategories.length > 0 ? menuBodyCategories.map((cat) => {
          const categoryProducts = catalogProducts[cat.id] ?? []
          const filteredProducts = filterAndSortProducts(categoryProducts)

          if (debouncedSearch.trim() && filteredProducts.length === 0) {
            return null
          }

          return (
            <section
              key={cat.id}
              ref={(el) => {
                categoryRefs.current[cat.id] = el
              }}
              className="cat-section"
            >
              <div className="cat-header">
                <h2 className="cat-title">{t(cat.name_en, cat.name_ar)}</h2>
                {cat.description_en && (
                  <p className="cat-desc">{t(cat.description_en, cat.description_ar ?? cat.description_en)}</p>
                )}
                <div className="gold-line" style={{ margin: '1rem 0 0', justifyContent: 'flex-start', display: 'flex' }}>
                  <div style={{ width: 40, height: 1, background: 'linear-gradient(90deg, var(--gold), transparent)' }} />
                </div>
              </div>

              <div className="product-grid">
                {filteredProducts.map((product, idx) => {
                  return (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.4, delay: Math.min(idx * 0.05, 0.3) }}
                    >
                      <ProductCard
                        product={product}
                        isFeatured={product.is_featured}
                        language={language}
                        layout={nativeUi ? 'native' : 'web'}
                        formatPrice={formatPrice}
                        isOrderable={isOrderable}
                        delay={0}
                        onSelect={() => setSelectedProduct(product)}
                        onQuickAdd={() => {
                          if (!isOrderable) return
                          triggerHapticImpact(ImpactStyle.Medium)
                          addItem(product, 1, {}, '')
                          notifyCartAddedProduct(product)
                        }}
                        promotionalProductIds={promotionalProductIds}
                        activePromotions={activePromotions}
                        calculatePromotionalPrice={calculatePromotionalPrice}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </section>
          )
        }) : null}
      </div>

      <ProductDetailSheet
        product={selectedProduct}
        language={language}
        shell={nativeUi ? 'native' : 'web'}
        formatPrice={formatPrice}
        isOrderable={isOrderable}
        unavailableMessage={closedMessage}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(qty, mods, notes) => {
          if (!selectedProduct || !isOrderable) return
          addItem(selectedProduct, qty, mods, notes)
          const label = language === 'ar' && selectedProduct.name_ar ? selectedProduct.name_ar : selectedProduct.name_en
          setSelectedProduct(null)
          if (isNativeCustomerApp()) {
            notifyCartAddedLabel(label)
            return
          }
          navigate('/cart')
        }}
      />

      <style>{`
        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  )
}
