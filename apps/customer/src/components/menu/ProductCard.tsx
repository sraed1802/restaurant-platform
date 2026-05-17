import { ClockIcon, UtensilsIcon } from '../Icons'
import { DIETARY_FILTERS, dietaryBadgeLabel } from '../../lib/dietaryTags'
import type { PromotionRow } from '../../lib/menuPromotions'
import type { ProductWithModifiers } from './types'

type Props = {
  product: ProductWithModifiers
  isFeatured: boolean
  language: string
  formatPrice: (p: number) => string
  isOrderable: boolean
  delay: number
  onSelect: () => void
  onQuickAdd: () => void
  promotionalProductIds: Set<string>
  activePromotions: PromotionRow[]
  calculatePromotionalPrice: (product: ProductWithModifiers, promotions: PromotionRow[]) => number
  /** Larger tap targets and stacked actions for the Capacitor shell */
  layout?: 'web' | 'native'
}

export function ProductCard({
  product,
  isFeatured,
  language,
  formatPrice,
  isOrderable,
  delay,
  onSelect,
  onQuickAdd,
  promotionalProductIds,
  activePromotions,
  calculatePromotionalPrice,
  layout = 'web',
}: Props) {
  const t = (en: string, ar: string | null) => (language === 'ar' && ar ? ar : en)
  const lang = language === 'ar' ? 'ar' : 'en'
  const isPromotional = promotionalProductIds.has(product.id)
  const hasCustomizations = (product.modifier_groups ?? []).some((group) =>
    group.options.some((option) => option.is_available)
  )

  const dietaryTags = (product.tags ?? []).filter((tag) =>
    DIETARY_FILTERS.some((f) => f.key === tag.toLowerCase())
  )

  const nativeCard = layout === 'native'

  return (
    <article
      className={`product-card ${isFeatured ? 'featured-product' : ''} ${isPromotional ? 'promotional' : ''} ${nativeCard ? 'product-card--native' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <button type="button" className="product-card-main" onClick={onSelect}>
        <div className="product-image-wrap">
          {product.image_url ? (
            <img src={product.image_url} alt={t(product.name_en, product.name_ar)} loading="lazy" />
          ) : (
            <div className="product-image-placeholder" aria-hidden>
              <UtensilsIcon />
            </div>
          )}
          {isFeatured && (
            <div className="featured-badge">
              <span>✦</span> {language === 'ar' ? 'مميز' : 'Featured'}
            </div>
          )}
          {isPromotional && (
            <div className="promo-badge">
              <span>{language === 'ar' ? 'عرض خاص' : 'Special Offer'}</span>
            </div>
          )}
        </div>

        <div className="product-info">
          <div className="product-header">
            <h3 className="product-name">{t(product.name_en, product.name_ar)}</h3>
            <div className="price-display">
              {isPromotional &&
                (() => {
                  const promotionalPrice = calculatePromotionalPrice(product, activePromotions)
                  const hasDiscount = promotionalPrice < product.base_price
                  return (
                    <>
                      {hasDiscount && <span className="original-price">{formatPrice(product.base_price)}</span>}
                      {hasDiscount && (
                        <span className="discount-percentage">
                          {Math.round((1 - promotionalPrice / product.base_price) * 100)}% OFF
                        </span>
                      )}
                      <span className="product-price">{formatPrice(promotionalPrice)}</span>
                    </>
                  )
                })()}
              {!isPromotional && <span className="product-price">{formatPrice(product.base_price)}</span>}
            </div>
          </div>

          {dietaryTags.length > 0 && (
            <div className="dietary-badges" role="list">
              {dietaryTags.slice(0, 4).map((tag) => (
                <span key={tag} className="dietary-badge" role="listitem">
                  {dietaryBadgeLabel(tag, lang)}
                </span>
              ))}
            </div>
          )}
          {product.description_en && (
            <p className="product-desc">{t(product.description_en, product.description_ar)}</p>
          )}
          <div className="product-meta">
            {product.prep_time_minutes ? (
              <span className="prep-time">
                <ClockIcon /> {product.prep_time_minutes} min
              </span>
            ) : null}
            {product.calories ? <span className="calories">{product.calories} kcal</span> : null}
          </div>
        </div>
      </button>

      <div className={`product-card-footer ${nativeCard ? 'product-card-footer--native' : ''}`}>
        <span className="product-card-footer-copy">
          {hasCustomizations
            ? t('Open details to customize', 'افتح التفاصيل للتخصيص')
            : t('Ready to add instantly', 'جاهز للإضافة مباشرة')}
        </span>
        {hasCustomizations ? (
          <button type="button" className="product-card-customize-btn" onClick={onSelect} disabled={!isOrderable}>
            {t('Customize', 'تخصيص')}
          </button>
        ) : (
          <button
            type="button"
            className="product-card-quick-add"
            onClick={onQuickAdd}
            disabled={!isOrderable}
          >
            {t('Quick add', 'إضافة سريعة')}
          </button>
        )}
      </div>

      <style>{`
        .product-card {
          background: rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(12px) saturate(1.8);
          -webkit-backdrop-filter: blur(12px) saturate(1.8);
          border-radius: var(--radius-lg);
          border: 1px solid rgba(184, 151, 90, 0.15);
          overflow: hidden;
          transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
          animation: fadeUp 0.4s ease both;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
          width: 100%;
        }
        [data-theme="dark"] .product-card {
          background: rgba(26, 26, 26, 0.6);
          border: 1px solid rgba(212, 176, 122, 0.1);
        }
        .product-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(184, 151, 90, 0.3);
          border-color: rgba(184, 151, 90, 0.4);
        }
        .product-card.featured-product {
          border-color: rgba(184, 151, 90, 0.3);
        }
        .product-card.featured-product:hover {
          border-color: rgba(184, 151, 90, 0.6);
        }
        .product-card-main {
          width: 100%;
          text-align: start;
          background: transparent;
          color: inherit;
        }
        .product-image-wrap {
          position: relative;
          aspect-ratio: 4/5;
          overflow: hidden;
          background: var(--cream-2);
        }
        .product-image-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 400ms ease;
        }
        .product-card:hover .product-image-wrap img {
          transform: scale(1.04);
        }
        .product-image-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--gold);
          opacity: 0.65;
          background: linear-gradient(135deg, var(--cream-2), var(--cream-3));
        }
        .product-image-placeholder svg {
          width: 40px;
          height: 40px;
        }
        .featured-badge {
          position: absolute;
          top: 0.75rem;
          left: 0.75rem;
          padding: 0.25rem 0.6rem;
          background: rgba(14, 14, 14, 0.85);
          color: var(--gold-light);
          font-size: 0.65rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          backdrop-filter: blur(4px);
        }
        [dir='rtl'] .featured-badge {
          left: auto;
          right: 0.75rem;
        }
        .promo-badge {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          padding: 0.35rem 0.7rem;
          background: linear-gradient(135deg, var(--gold-dark), var(--gold));
          color: var(--cream);
          border-radius: 20px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          z-index: 2;
        }
        [dir='rtl'] .promo-badge {
          right: auto;
          left: 0.5rem;
        }
        .product-info {
          padding: 1rem;
        }
        .product-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .product-name {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--ink);
          line-height: 1.3;
          letter-spacing: 0.01em;
        }
        .product-price {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--gold-dark);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .price-display {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .original-price {
          font-size: 0.85rem;
          color: var(--ink-muted);
          text-decoration: line-through;
          opacity: 0.6;
        }
        .discount-percentage {
          background: var(--warning-muted);
          color: var(--warning);
          padding: 0.2rem 0.5rem;
          border-radius: 12px;
          font-size: 0.65rem;
          font-weight: 700;
        }
        .dietary-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-bottom: 0.5rem;
        }
        .dietary-badge {
          font-size: 0.62rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 0.2rem 0.45rem;
          border-radius: 4px;
          border: 1px solid var(--border);
          color: var(--ink-soft);
          background: var(--cream-2);
        }
        .product-desc {
          font-size: 0.8rem;
          color: var(--ink-muted);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 0.75rem;
        }
        .product-meta {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          font-size: 0.72rem;
          color: var(--ink-muted);
        }
        .prep-time {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .prep-time svg {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }
        .product-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0 1rem 1rem;
        }
        .product-card-footer-copy {
          font-size: 0.72rem;
          color: var(--ink-soft);
        }
        .product-card-action-link {
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--gold-dark);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .product-card-customize-btn {
          min-height: 38px;
          padding: 0.55rem 0.9rem;
          border-radius: 999px;
          border: none;
          background: transparent;
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--gold-dark);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
          cursor: pointer;
        }
        .product-card-customize-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .product-card-quick-add {
          min-height: 38px;
          padding: 0.55rem 0.9rem;
          border-radius: 999px;
          background: var(--ink);
          color: var(--cream);
          font-size: 0.78rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .product-card-quick-add:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .product-card--native:hover {
          transform: none;
          box-shadow: var(--shadow-sm);
        }
        .product-card--native .product-image-wrap {
          aspect-ratio: 16 / 10;
        }
        .product-card-footer--native {
          flex-direction: column;
          align-items: stretch;
          gap: 0.65rem;
          padding: 0 1rem 1.1rem;
        }
        .product-card-footer--native .product-card-footer-copy {
          font-size: 0.78rem;
          text-align: center;
        }
        .product-card-footer--native .product-card-quick-add,
        .product-card-footer--native .product-card-customize-btn {
          width: 100%;
          min-height: 48px;
          border-radius: 12px;
          font-size: 0.9rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .product-card-footer--native .product-card-customize-btn {
          background: rgba(184, 151, 90, 0.18);
          color: var(--ink);
        }
        .product-card-footer--native .product-card-quick-add {
          border-radius: 12px;
        }
      `}</style>
    </article>
  )
}
