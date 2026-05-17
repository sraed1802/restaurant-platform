import { Link } from 'react-router-dom'
import { useSessionStore } from '../store/sessionStore'
import { isHotelFulfillmentOrder } from '@rms/supabase/fulfillment'
import type { ActiveOrderProgress } from '../hooks/useActiveOrderProgress'
import { getOrderStatusNotifyCopy } from '../lib/nativeOrderStatusNotify'

function statusLabel(status: string, language: 'en' | 'ar', isHotel: boolean): string {
  const copy = getOrderStatusNotifyCopy(status, isHotel)
  return language === 'ar' ? copy.titleAr : copy.titleEn
}

export default function OrderProgressBanner({
  order,
  isCancelled = false,
}: {
  order: ActiveOrderProgress
  isCancelled?: boolean
}) {
  const { language } = useSessionStore()
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const shortId = order.id.slice(0, 8).toUpperCase()
  const isHotel = isHotelFulfillmentOrder(order)
  const label = statusLabel(order.status, language, isHotel)

  return (
    <div
      className={`order-progress-banner ${isCancelled ? 'order-progress-banner-cancelled' : ''}`}
      role="status"
    >
      <div className="order-progress-banner-copy">
        <p className="order-progress-banner-kicker">
          {isCancelled
            ? t('Order cancelled', 'تم إلغاء الطلب')
            : t('Order in progress', 'طلب قيد التنفيذ')}{' '}
          · #{shortId}
        </p>
        <p className="order-progress-banner-status">{label}</p>
      </div>
      <Link to={`/track/${order.id}`} className="order-progress-banner-link">
        {t('Details', 'التفاصيل')}
      </Link>
      <style>{`
        .order-progress-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin: 0 0 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          background: linear-gradient(90deg, rgba(184, 151, 90, 0.22), rgba(184, 151, 90, 0.08));
          border: 1px solid rgba(184, 151, 90, 0.35);
          color: var(--ink);
        }
        .order-progress-banner-cancelled {
          background: linear-gradient(90deg, rgba(185, 28, 28, 0.14), rgba(185, 28, 28, 0.06));
          border-color: rgba(185, 28, 28, 0.35);
        }
        .order-progress-banner-cancelled .order-progress-banner-status {
          color: #b91c1c;
        }
        .order-progress-banner-cancelled .order-progress-banner-link {
          background: #b91c1c;
        }
        .order-progress-banner-kicker {
          margin: 0;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }
        .order-progress-banner-status {
          margin: 0.15rem 0 0;
          font-size: 0.95rem;
          font-weight: 700;
        }
        .order-progress-banner-link {
          flex-shrink: 0;
          padding: 0.45rem 0.85rem;
          border-radius: 999px;
          background: var(--ink);
          color: var(--cream);
          font-size: 0.78rem;
          font-weight: 700;
          text-decoration: none;
        }
      `}</style>
    </div>
  )
}
