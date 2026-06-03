// apps/customer/src/pages/OffersPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { StorageImage } from '../components/StorageImage'
import { useSessionStore } from '../store/sessionStore'
import {
  fetchCustomerPromotionContext,
  filterPromotionsForCustomer,
} from '../services/promotionEligibility'

interface Promotion {
  id: string
  name_en: string
  name_ar: string
  title_en: string
  title_ar: string
  description_en: string
  description_ar: string
  code?: string
  discount_type: 'percentage' | 'fixed' | 'free_delivery'
  discount_value: number
  min_order_value: number
  valid_from: string
  valid_until: string
  condition_type?: string
  is_featured: boolean
  image_url?: string
}

export default function OffersPage() {
  const { language, phone, customerId } = useSessionStore()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  useEffect(() => {
    void loadPromotions()
  }, [customerId, phone])

  async function loadPromotions() {
    setLoading(true)
    try {
      const now = new Date()
      const [{ data, error }, promotionContext] = await Promise.all([
        supabase
          .from('promotions')
          .select('*')
          .or('valid_until.is.null,valid_until.gt.' + now.toISOString())
          .or('valid_from.is.null,valid_from.lte.' + now.toISOString())
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false }),
        fetchCustomerPromotionContext(phone).catch((contextError) => {
          console.error('Failed to load promotion eligibility:', contextError)
          return { hasPlacedOrder: false }
        }),
      ])

      if (error) throw error

      setPromotions(
        filterPromotionsForCustomer((data ?? []) as Promotion[], promotionContext)
      )
    } catch (error) {
      console.error('Failed to load promotions:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>{t('Special Offers', 'العروض الخاصة')}</h1>
        </div>
        <div className="loading-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="offer-card skeleton"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('Special Offers', 'العروض الخاصة')}</h1>
        <p>{t('Save more with our exclusive deals', 'وفر أكثر مع عروضنا الحصرية')}</p>
      </div>

      {promotions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎁</div>
          <h2>{t('No offers available', 'لا توجد عروض متاحة')}</h2>
          <p>{t('Check back later for new promotions', 'تحقق لاحقًا للحصول على عروض جديدة')}</p>
        </div>
      ) : (
        <div className="offers-grid">
          {promotions.map(promo => (
            <div key={promo.id} className="offer-card">
              <div className="offer-header">
                <div className="offer-type">
                  {promo.code ? (
                    <span className="promo-code">{promo.code}</span>
                  ) : (
                    <span className="promo-type">{t('Special Offer', 'عرض خاص')}</span>
                  )}
                </div>
              </div>
              {promo.image_url && (
                <div className="offer-image">
                  <StorageImage
                    src={promo.image_url}
                    preset="offer"
                    alt={t(promo.title_en, promo.title_ar)}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              <div className="offer-content">
                <h3>{t(promo.title_en, promo.title_ar)}</h3>
                <p className="offer-description">
                  {t(promo.description_en, promo.description_ar)}
                </p>
                <div className="offer-details">
                  <div className="discount-badge">
                    {promo.discount_type === 'percentage'
                      ? `${promo.discount_value}% OFF`
                      : promo.discount_type === 'free_delivery'
                      ? '🚚 Free Delivery'
                      : `QAR ${promo.discount_value} OFF`}
                  </div>
                  {promo.min_order_value > 0 && (
                    <div className="min-order">
                      {t(`Min order: QAR ${promo.min_order_value}`, `الحد الأدنى: ${promo.min_order_value} ريال`)}
                    </div>
                  )}
                </div>
                {promo.code && (
                  <div className="offer-code">
                    <span>{t('Code:', 'الرمز:')}</span>
                    <code>{promo.code}</code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1rem 4rem;
        }
        .page-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .page-header h1 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 5vw, 2.5rem);
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }
        .page-header p {
          font-size: 1.125rem;
          color: var(--ink-muted);
        }
        .offers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .offer-card {
          position: relative;
          background: var(--surface);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .offer-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        .offer-header {
          background: linear-gradient(135deg, var(--gold), var(--gold-dark));
          padding: 0.75rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .offer-type {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .promo-code {
          background: rgba(255,255,255,0.2);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: 0.05em;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .promo-type {
          background: rgba(255,255,255,0.15);
          color: white;
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-weight: 500;
          font-size: 0.85rem;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .featured-badge {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: var(--gold);
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          z-index: 1;
        }
        [dir="rtl"] .featured-badge {
          right: auto;
          left: 1rem;
        }
        .offer-image {
          position: relative;
          aspect-ratio: 16/9;
          overflow: hidden;
        }
        .offer-image img,
        .offer-image .storage-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .offer-content {
          padding: 1.5rem;
        }
        .offer-content h3 {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.75rem;
        }
        .offer-description {
          font-size: 0.9375rem;
          color: var(--ink-muted);
          line-height: 1.6;
          margin-bottom: 1rem;
        }
        .offer-details {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .discount-badge {
          background: linear-gradient(135deg, var(--gold), var(--gold-dark));
          color: white;
          padding: 0.6rem 1.2rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1rem;
          box-shadow: 0 4px 12px rgba(184,151,90,0.3);
          position: relative;
          overflow: hidden;
        }
        .discount-badge::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shine 3s infinite;
        }
        @keyframes shine {
          0% { left: -100%; }
          20% { left: 100%; }
          100% { left: 100%; }
        }
        .min-order {
          background: var(--surface-secondary);
          color: var(--ink-muted);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
        }
        .offer-code {
          background: linear-gradient(135deg, var(--surface-secondary), var(--surface));
          border: 2px dashed var(--gold);
          padding: 1rem;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          transition: all 0.3s ease;
        }
        .offer-code:hover {
          border-color: var(--gold-dark);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(184,151,90,0.2);
        }
        .offer-code span {
          font-size: 0.875rem;
          color: var(--ink-muted);
          font-weight: 500;
        }
        .offer-code code {
          font-family: 'Courier New', monospace;
          font-size: 1.1rem;
          color: var(--gold-dark);
          font-weight: 700;
          background: var(--cream);
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          border: 1px solid var(--gold);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
        }
        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        .empty-state h2 {
          font-family: var(--font-display);
          font-size: 1.5rem;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }
        .empty-state p {
          color: var(--ink-muted);
        }
        .loading-skeleton {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .skeleton {
          aspect-ratio: 16/9;
          background: linear-gradient(90deg, var(--surface-secondary) 25%, var(--surface) 50%, var(--surface-secondary) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: var(--radius-lg);
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 640px) {
          .page-container {
            padding: 1.5rem 0.9rem 3rem;
          }

          .page-header {
            margin-bottom: 1.5rem;
          }

          .page-header p {
            font-size: 1rem;
          }

          .offer-header,
          .offer-content {
            padding-inline: 1rem;
          }

          .offer-code {
            flex-direction: column;
            align-items: flex-start;
          }

          .offer-code code {
            width: 100%;
            text-align: center;
          }
        }

        @media (max-width: 420px) {
          .offers-grid,
          .loading-skeleton {
            grid-template-columns: 1fr;
          }

          .discount-badge,
          .min-order {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </div>
  )
}
