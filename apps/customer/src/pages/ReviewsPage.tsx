// apps/customer/src/pages/ReviewsPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import ReviewSystem from '../components/ReviewSystem'
import { fetchReviewableProducts, type ReviewableProductMeta } from '../services/reviewEligibility'
import { useSessionStoreHydrated } from '../hooks/useSessionStoreHydrated'
import type { Product, Category } from '../../types'

interface ReviewStats {
  total_reviews: number
  average_rating: number
  rating_distribution: Record<number, number>
}

interface ProductReview {
  rating: number
  is_verified: boolean
  customer_id?: string
}

interface ProductWithReviews extends Product {
  categories?: Category
  customer_reviews?: ProductReview[]
}

export default function ReviewsPage() {
  const { language, customerId, customerName, isVerified } = useSessionStore()
  const sessionHydrated = useSessionStoreHydrated()
  const [products, setProducts] = useState<ProductWithReviews[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductWithReviews | null>(null)
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'reviews'>('reviews')
  const [pendingWriteProductId, setPendingWriteProductId] = useState<string | null>(null)
  const [reviewableByProduct, setReviewableByProduct] = useState<Map<string, ReviewableProductMeta>>(new Map())
  const detailPanelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const clearWriteIntent = useCallback(() => setPendingWriteProductId(null), [])

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  function categoryLabel(product: ProductWithReviews): string {
    const raw = product.categories as unknown
    if (!raw) return ''
    const row = Array.isArray(raw) ? raw[0] : raw
    if (!row || typeof row !== 'object') return ''
    const o = row as Record<string, string>
    return language === 'ar' ? (o.name_ar ?? '') : (o.name_en ?? '')
  }

  function scrollDetailIntoView() {
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  useEffect(() => {
    if (!sessionHydrated) return
    // Require login to access reviews
    if (!customerId) {
      navigate('/login?next=/reviews')
      return
    }
    void loadProducts()
  }, [sessionHydrated, customerId, navigate])

  async function loadProducts() {
    if (!customerId) return

    try {
      const eligible = await fetchReviewableProducts(customerId)
      setReviewableByProduct(eligible)

      const productIds = [...eligible.keys()]
      if (productIds.length === 0) {
        setProducts([])
        await loadGlobalStatsForProducts([])
        return
      }

      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(name_en, name_ar)
        `)
        .in('id', productIds)
        .order('name_en')

      if (error) throw error

      const productRows = (data ?? []) as ProductWithReviews[]
      setProducts(
        productRows.map((product) => ({
          ...product,
          customer_reviews: [],
        }))
      )
      await loadGlobalStatsForProducts(productIds)
    } catch (error) {
      console.error('Failed to load reviewable products:', error)
      setProducts([])
      setReviewableByProduct(new Map())
      await loadGlobalStatsForProducts([])
    } finally {
      setLoading(false)
    }
  }

  async function loadGlobalStatsForProducts(productIds: string[]) {
    try {
      if (productIds.length === 0) {
        setStats({
          total_reviews: 0,
          average_rating: 0,
          rating_distribution: {},
        })
        return
      }

      const { data } = await supabase
        .from('customer_reviews')
        .select('rating')
        .in('product_id', productIds)

      const ratingRows = (data ?? []) as Array<Pick<ProductReview, 'rating'>>

      if (ratingRows.length > 0) {
        const total = ratingRows.length
        const average = ratingRows.reduce((sum, r) => sum + r.rating, 0) / total
        const distribution = ratingRows.reduce((acc, r) => {
          acc[r.rating] = (acc[r.rating] || 0) + 1
          return acc
        }, {} as Record<number, number>)

        setStats({
          total_reviews: total,
          average_rating: average,
          rating_distribution: distribution
        })
      } else {
        // Handle case with no reviews
        setStats({
          total_reviews: 0,
          average_rating: 0,
          rating_distribution: {}
        })
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const filteredAndSortedProducts = products
    .filter(product => {
      const searchLower = searchQuery.toLowerCase()
      const name = language === 'ar' ? product.name_ar : product.name_en
      return name.toLowerCase().includes(searchLower)
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          const nameA = language === 'ar' ? a.name_ar : a.name_en
          const nameB = language === 'ar' ? b.name_ar : b.name_en
          return nameA.localeCompare(nameB)
        case 'rating':
          const ratingA = (a as any).average_rating || 0
          const ratingB = (b as any).average_rating || 0
          return ratingB - ratingA
        case 'reviews':
          const reviewsA = (a as any).review_count || 0
          const reviewsB = (b as any).review_count || 0
          return reviewsB - reviewsA
        default:
          return 0
      }
    })

  if (loading) {
    return (
      <div className="reviews-page">
        <div className="reviews-header">
          <div className="skeleton" style={{ height: 60, width: 300 }} />
          <div className="skeleton" style={{ height: 120, width: 400 }} />
        </div>
        <div className="reviews-content">
          <div className="filters-section">
            <div className="skeleton" style={{ height: 40, width: 200 }} />
            <div className="skeleton" style={{ height: 40, width: 150 }} />
          </div>
          <div className="products-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 200, borderRadius: 12 }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="reviews-page">
      {/* Header */}
      <div className="reviews-header">
        <div className="header-content">
          <h1>{t('Your order reviews', 'تقييمات طلباتك')}</h1>
          <p>
            {t(
              'Review dishes from your completed deliveries only.',
              'قيّم الأطباق من طلباتك المكتملة فقط.'
            )}
          </p>
        </div>

        {/* Global Stats */}
        {stats && (
          <div className="global-stats">
            <div className="stat-card">
              <div className="stat-number">{stats.average_rating > 0 ? stats.average_rating.toFixed(1) : '0.0'}</div>
              <div className="stat-label">{t('Average Rating', 'متوسط التقييم')}</div>
              <div className="stars">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={`star ${i < Math.floor(stats.average_rating) ? 'filled' : ''}`}>
                    ★
                  </span>
                ))}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.total_reviews}</div>
              <div className="stat-label">{t('Total Reviews', 'إجمالي المراجعات')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="reviews-content">
        {/* Filters */}
        <div className="filters-section">
          <div className="search-filter">
            <input
              type="text"
              placeholder={t('Search your ordered dishes...', 'ابحث في أطباقك التي طلبتها...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="sort-filter">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="sort-select"
            >
              <option value="reviews">{t('Most Reviewed', 'الأكثر تقييماً')}</option>
              <option value="rating">{t('Highest Rated', 'الأعلى تقييماً')}</option>
              <option value="name">{t('Alphabetical', 'أبجدي')}</option>
            </select>
          </div>
        </div>

        {filteredAndSortedProducts.length === 0 ? (
          <div className="reviews-empty">
            <p>
              {t(
                'No delivered orders yet. After your order is delivered, the dishes you ordered will appear here for review.',
                'لا توجد طلبات مكتملة بعد. بعد توصيل طلبك، ستظهر الأطباق التي طلبتها هنا للتقييم.'
              )}
            </p>
          </div>
        ) : (
        <div className="products-grid">
          {filteredAndSortedProducts.map(product => {
            const averageRating = (product as any).average_rating || 0
            const reviewCount = (product as any).review_count || 0
            const eligibility = reviewableByProduct.get(product.id)

            return (
              <div 
                key={product.id} 
                className={`product-review-card ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedProduct(product)
                  setPendingWriteProductId(null)
                  scrollDetailIntoView()
                }}
              >
                <div className="product-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={language === 'ar' ? product.name_ar : product.name_en} />
                  ) : (
                    <div className="placeholder-image">🍽️</div>
                  )}
                </div>
                
                <div className="product-info">
                  <h3>{language === 'ar' ? product.name_ar : product.name_en}</h3>
                  <p className="product-category">{categoryLabel(product)}</p>
                  
                  <div className="rating-summary">
                    <div className="rating-stars">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={`star ${i < Math.floor(averageRating) ? 'filled' : ''}`}>
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="rating-text">
                      {averageRating.toFixed(1)} ({reviewCount} {t('reviews', 'مراجعات')})
                    </span>
                  </div>
                </div>

                <div className="product-actions">
                  <button
                    type="button"
                    className="view-reviews-btn"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelectedProduct(product)
                      setPendingWriteProductId(null)
                      scrollDetailIntoView()
                    }}
                  >
                    {t('View Reviews', 'عرض المراجعات')}
                  </button>
                  {customerId && eligibility && !eligibility.hasReviewed && (
                    <button
                      type="button"
                      className="write-review-btn"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setSelectedProduct(product)
                        setPendingWriteProductId(product.id)
                        scrollDetailIntoView()
                      }}
                    >
                      {t('Write Review', 'اكتب مراجعة')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Selected Product Reviews */}
        {selectedProduct && (
          <div className="selected-reviews" ref={detailPanelRef} id="reviews-detail-panel">
            <div className="selected-header">
              <h2>{language === 'ar' ? selectedProduct.name_ar : selectedProduct.name_en}</h2>
              <button 
                type="button"
                className="close-btn"
                onClick={() => {
                  setSelectedProduct(null)
                  setPendingWriteProductId(null)
                }}
              >
                ×
              </button>
            </div>
            <ReviewSystem 
              productId={selectedProduct.id}
              productNameEn={selectedProduct.name_en}
              productNameAr={selectedProduct.name_ar}
              canWriteReview={
                !!reviewableByProduct.get(selectedProduct.id) &&
                !reviewableByProduct.get(selectedProduct.id)!.hasReviewed
              }
              eligibleOrderId={reviewableByProduct.get(selectedProduct.id)?.orderId ?? null}
              openWriteIntent={
                pendingWriteProductId !== null && pendingWriteProductId === selectedProduct.id
              }
              onWriteIntentConsumed={clearWriteIntent}
            />
          </div>
        )}
      </div>

      <style>{`
        .reviews-page {
          min-height: 100vh;
          background: linear-gradient(180deg, var(--cream) 0%, var(--cream-2) 100%);
          padding: 2rem 1rem 4rem;
        }

        .reviews-header {
          max-width: 1200px;
          margin: 0 auto 3rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 2rem;
        }

        .header-content h1 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 5vw, 2.5rem);
          font-weight: 700;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .header-content p {
          font-size: 1.1rem;
          color: var(--ink-soft);
        }

        .global-stats {
          display: flex;
          gap: 2rem;
          flex-wrap: wrap;
        }

        .stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          text-align: center;
          min-width: 150px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .stat-number {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--gold);
          margin-bottom: 0.5rem;
        }

        .stat-label {
          font-size: 0.9rem;
          color: var(--ink-muted);
          margin-bottom: 0.5rem;
        }

        .stars {
          display: flex;
          justify-content: center;
          gap: 0.1rem;
        }

        .star {
          font-size: 1rem;
          color: var(--cream-3);
        }

        .star.filled {
          color: var(--gold);
        }

        .reviews-content {
          max-width: 1200px;
          margin: 0 auto;
        }

        .reviews-empty {
          padding: 2.5rem 1.5rem;
          text-align: center;
          background: var(--surface);
          border: 1px dashed var(--border);
          border-radius: var(--radius-md);
          color: var(--ink-soft);
          line-height: 1.6;
        }

        .filters-section {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          align-items: stretch;
        }

        .search-filter {
          flex: 1;
          min-width: 220px;
        }

        .search-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 1rem;
          background: var(--surface);
          transition: border-color 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--gold);
        }

        .sort-filter {
          min-width: 150px;
        }

        .sort-select {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 1rem;
          background: var(--surface);
          cursor: pointer;
        }

        .products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 3rem;
        }

        .product-review-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .product-review-card:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
        }

        .product-review-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
          border-color: var(--gold);
        }

        .product-review-card.selected {
          border-color: var(--gold);
          box-shadow: 0 0 0 2px var(--gold-light);
        }

        .product-image {
          height: 180px;
          position: relative;
          overflow: hidden;
        }

        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .placeholder-image {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          background: var(--cream-2);
        }

        .product-info {
          padding: 1.5rem;
          min-width: 0;
        }

        .product-info h3 {
          font-size: 1.18rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .product-category {
          color: var(--ink-muted);
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }

        .rating-summary {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .rating-stars {
          display: flex;
          gap: 0.1rem;
        }

        .rating-text {
          font-size: 0.9rem;
          color: var(--ink-soft);
        }

        .product-actions {
          display: flex;
          gap: 0.75rem;
          padding: 0 1.5rem 1.5rem;
          flex-wrap: wrap;
        }

        .view-reviews-btn,
        .product-actions .write-review-btn {
          flex: 1;
          padding: 0.75rem;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          z-index: 2;
          font-family: inherit;
        }

        .view-reviews-btn {
          background: var(--cream-2);
          color: var(--ink);
          border: 1px solid var(--border);
        }

        .view-reviews-btn:hover {
          background: var(--surface);
          border-color: var(--gold);
          color: var(--ink);
        }

        .product-actions .write-review-btn {
          background: var(--ink);
          color: var(--cream);
          border: 1px solid var(--ink);
        }

        .product-actions .write-review-btn:hover {
          background: var(--gold);
          border-color: var(--gold);
          color: var(--cream);
        }

        .selected-reviews {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 2rem;
          margin-top: 2rem;
        }

        .selected-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .selected-header h2 {
          font-family: var(--font-display);
          font-size: 1.8rem;
          font-weight: 600;
          color: var(--ink);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 2rem;
          color: var(--ink-muted);
          cursor: pointer;
          padding: 0;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s ease;
        }

        .close-btn:hover {
          background: var(--cream-2);
          color: var(--ink);
        }

        @media (max-width: 768px) {
          .reviews-header {
            flex-direction: column;
            text-align: start;
            margin-bottom: 2rem;
          }

          .global-stats {
            width: 100%;
            gap: 1rem;
          }

          .products-grid {
            grid-template-columns: 1fr;
          }

          .filters-section {
            flex-direction: column;
          }

          .search-filter {
            min-width: auto;
          }

          .selected-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
            text-align: start;
          }

          .product-actions {
            flex-direction: column;
          }

          .view-reviews-btn,
          .product-actions .write-review-btn {
            width: 100%;
          }

          .selected-reviews {
            padding: 1.25rem;
            margin-top: 1.5rem;
          }

          .close-btn {
            align-self: flex-end;
          }
        }

        @media (max-width: 480px) {
          .reviews-page {
            padding: 1.25rem 0.9rem 3rem;
          }

          .stat-card {
            flex: 1 1 140px;
            min-width: 0;
          }

          .product-info,
          .product-actions {
            padding-inline: 1rem;
          }

          .product-actions {
            padding-bottom: 1rem;
          }
        }
      `}</style>
    </div>
  )
}
