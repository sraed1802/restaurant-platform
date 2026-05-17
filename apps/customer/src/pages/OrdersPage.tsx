// apps/customer/src/pages/OrdersPage.tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { useSessionStoreHydrated } from '../hooks/useSessionStoreHydrated'

interface OrderRow {
  id: string
  status: string
  total: number
  created_at: string
  order_items?: Array<{
    quantity: number
    product_snapshot: { name_en?: string; name_ar?: string } | null
  }>
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const sessionHydrated = useSessionStoreHydrated()
  const { language } = useSessionStore()
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionHydrated) return
    let cancelled = false

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        navigate(`/login?next=${encodeURIComponent('/orders')}`, { replace: true })
        return
      }

      const { data, error: qErr } = await supabase
        .from('orders')
        .select(`
          id, status, total, created_at,
          order_items(quantity, product_snapshot)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (cancelled) return
      if (qErr) {
        setError(qErr.message)
        setOrders([])
      } else {
        setOrders((data as OrderRow[]) ?? [])
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [navigate, sessionHydrated])

  if (loading) {
    return (
      <div className="orders-page">
        <p className="orders-muted">{t('Loading your orders…', 'جارٍ تحميل طلباتك…')}</p>
        <style>{ordersStyles}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div className="orders-page">
        <p className="orders-error">{error}</p>
        <Link to="/menu">{t('Back to menu', 'العودة إلى القائمة')}</Link>
        <style>{ordersStyles}</style>
      </div>
    )
  }

  return (
    <div className="orders-page">
      <h1 className="orders-title">{t('Your orders', 'طلباتك')}</h1>
      <p className="orders-desc">
        {t(
          'Orders placed while signed in with your email are listed here.',
          'تظهر هنا الطلبات التي تمّت أثناء تسجيل الدخول بنفس بريدك الإلكتروني.'
        )}
      </p>

      {orders.length === 0 ? (
        <p className="orders-muted">{t('No orders yet.', 'لا توجد طلبات بعد.')}</p>
      ) : (
        <ul className="orders-list">
          {orders.map((o) => (
            <li key={o.id} className="orders-row">
              <div>
                <span className="orders-ref">#{o.id.slice(0, 8).toUpperCase()}</span>
                <span className="orders-meta">
                  {new Date(o.created_at).toLocaleString(language === 'ar' ? 'ar-QA' : 'en-QA')} · {o.status}
                </span>
                {Array.isArray(o.order_items) && o.order_items.length > 0 && (
                  <span className="orders-items">
                    {o.order_items
                      .slice(0, 2)
                      .map((it) => {
                        const snap = it.product_snapshot
                        const name = language === 'ar' ? snap?.name_ar : snap?.name_en
                        return `${it.quantity}× ${name ?? t('Item', 'عنصر')}`
                      })
                      .join(' · ')}
                    {o.order_items.length > 2 ? ` ${t('…', '…')}` : ''}
                  </span>
                )}
              </div>
              <div className="orders-actions">
                <span className="orders-total">{Number(o.total).toFixed(2)}</span>
                <Link to={`/track/${o.id}`} className="orders-link">
                  {t('Track', 'تتبع')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <style>{ordersStyles}</style>
    </div>
  )
}

const ordersStyles = `
  .orders-page {
    max-width: 640px;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  .orders-title {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 300;
    margin-bottom: 0.5rem;
    color: var(--ink);
  }
  .orders-desc {
    font-size: 0.875rem;
    color: var(--ink-muted);
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }
  .orders-muted { color: var(--ink-muted); font-size: 0.9rem; }
  .orders-error { color: var(--danger); margin-bottom: 1rem; }
  .orders-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .orders-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.1rem;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--elev-1);
  }
  .orders-ref {
    font-weight: 600;
    color: var(--ink);
    display: block;
    margin-bottom: 0.25rem;
  }
  .orders-meta {
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  .orders-items {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.82rem;
    color: var(--ink);
    opacity: 0.9;
    line-height: 1.35;
  }
  .orders-actions {
    text-align: end;
    flex-shrink: 0;
  }
  .orders-total {
    display: block;
    font-weight: 600;
    color: var(--gold);
    margin-bottom: 0.35rem;
  }
  .orders-link {
    font-size: 0.82rem;
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .orders-link:hover { color: var(--gold); }
`
