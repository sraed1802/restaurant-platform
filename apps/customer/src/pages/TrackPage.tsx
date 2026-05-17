// apps/customer/src/pages/TrackPage.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { formatDeliveryAddressSummary, isHotelFulfillmentOrder } from '@rms/supabase/fulfillment'
import { supabase } from '../lib/supabase'
import type { DeliveryAddress, Product } from '../../types'
import { useSessionStore } from '../store/sessionStore'
import { useCartStore } from '../store/cartStore'
import { isNativeCustomerApp } from '../lib/nativeCustomerShell'
import { notifyNativeOrderStatusChange, requestOrderTrackingNotifyPermission } from '../lib/nativeOrderStatusNotify'
import { mapsUrlForLocation, parseDriverLocation, type DriverGpsLocation } from '../lib/driverLocation'
import { CheckIcon, PhoneIcon } from '../components/Icons'

interface TrackOrder {
  id: string
  status: string
  total: number
  created_at: string
  fulfillment_mode?: 'outside_delivery' | 'hotel_room_delivery'
  delivery_address?: Record<string, unknown> | null
  driver_id: string | null
  drivers?: { name: string; phone_e164: string } | null
  order_items?: Array<{
    id: string
    quantity: number
    unit_price: number
    product: {
      id: string
      name_en: string
      name_ar: string
      base_price: number
      image_url?: string
    }
    notes?: string
  }>
}

type TrackOrderDriver = NonNullable<TrackOrder['drivers']>

type TrackOrderQueryResult = Omit<TrackOrder, 'drivers'> & {
  drivers?: TrackOrderDriver | TrackOrderDriver[] | null
}

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'

export default function TrackPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { language } = useSessionStore()
  const navigate = useNavigate()
  const clearCart = useCartStore((s) => s.clearCart)
  const addItem = useCartStore((s) => s.addItem)
  const [order, setOrder] = useState<TrackOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [reordering, setReordering] = useState(false)
  const [driverLocation, setDriverLocation] = useState<DriverGpsLocation | null>(null)
  const prevOrderStatusRef = useRef<string | null>(null)
  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  const etaLabel = useMemo(() => {
    if (!order?.created_at) return null
    const start = new Date(order.created_at)
    const readyBy = new Date(start.getTime() + 40 * 60 * 1000)
    return readyBy.toLocaleTimeString(language === 'ar' ? 'ar-QA' : 'en-QA', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [order?.created_at, language])
  const isHotelRoomDelivery = isHotelFulfillmentOrder(order)
  const stages: Array<{ key: OrderStatus; labelEn: string; labelAr: string }> = isHotelRoomDelivery
    ? [
        { key: 'pending', labelEn: 'Order received', labelAr: 'تم استلام الطلب' },
        { key: 'confirmed', labelEn: 'Order confirmed', labelAr: 'تم تأكيد الطلب' },
        { key: 'preparing', labelEn: 'Being prepared', labelAr: 'جارٍ التحضير' },
        { key: 'ready', labelEn: 'Ready for room drop-off', labelAr: 'جاهز للتوصيل للغرفة' },
        { key: 'delivered', labelEn: 'Delivered to room', labelAr: 'تم التوصيل إلى الغرفة' },
      ]
    : [
        { key: 'pending', labelEn: 'Order received', labelAr: 'تم استلام الطلب' },
        { key: 'confirmed', labelEn: 'Order confirmed', labelAr: 'تم تأكيد الطلب' },
        { key: 'preparing', labelEn: 'In the kitchen', labelAr: 'جارٍ التحضير' },
        { key: 'ready', labelEn: 'Ready for pickup', labelAr: 'جاهز للاستلام' },
        { key: 'dispatched', labelEn: 'On the way', labelAr: 'في الطريق إليك' },
        { key: 'delivered', labelEn: 'Delivered', labelAr: 'تم التوصيل' },
      ]

  useEffect(() => {
    prevOrderStatusRef.current = null
  }, [orderId])

  useEffect(() => {
    if (!orderId || !isNativeCustomerApp()) return
    void requestOrderTrackingNotifyPermission()
  }, [orderId])

  useEffect(() => {
    if (!isNativeCustomerApp() || !order) return
    const shortId = order.id.slice(0, 8).toUpperCase()
    if (prevOrderStatusRef.current === null) {
      prevOrderStatusRef.current = order.status
      return
    }
    if (prevOrderStatusRef.current === order.status) return
    notifyNativeOrderStatusChange({
      language,
      status: order.status,
      isHotelRoomDelivery,
      orderShortId: shortId,
    })
    prevOrderStatusRef.current = order.status
  }, [order, language, isHotelRoomDelivery])

  useEffect(() => {
    if (!orderId) return
    loadOrder()

    // Subscribe to live updates
    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          setOrder((prev) => prev ? { ...prev, ...(payload.new as Partial<TrackOrder>) } : null)
        }
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [orderId])

  useEffect(() => {
    if (!order?.driver_id || order.status !== 'dispatched') {
      setDriverLocation(null)
      return
    }

    let cancelled = false

    async function loadDriverLocation() {
      const { data, error } = await supabase
        .from('drivers')
        .select('current_location')
        .eq('id', order!.driver_id!)
        .maybeSingle()

      if (cancelled || error) return
      setDriverLocation(parseDriverLocation(data?.current_location))
    }

    void loadDriverLocation()

    const channel = supabase
      .channel(`track:driver-location:${order.driver_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
          filter: `id=eq.${order.driver_id}`,
        },
        (payload) => {
          setDriverLocation(parseDriverLocation((payload.new as { current_location?: unknown }).current_location))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void channel.unsubscribe()
    }
  }, [order?.driver_id, order?.status])

  async function loadOrder() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, total, created_at, fulfillment_mode, delivery_address, driver_id, drivers!orders_driver_id_fkey(name, phone_e164),
          order_items(
            id, quantity, unit_price, notes,
            product:products(id, name_en, name_ar, base_price, image_url)
          )
        `)
        .eq('id', orderId!)
        .maybeSingle()

      if (error) {
        console.error('Failed to load order:', error.message)
      }

      if (data) {
        const rawOrder = data as unknown as TrackOrderQueryResult
        const orderData: TrackOrder = {
          ...rawOrder,
          drivers: Array.isArray(rawOrder.drivers) ? (rawOrder.drivers[0] ?? null) : (rawOrder.drivers ?? null),
        }
        setOrder(orderData)
      } else {
        setOrder(null)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="track-spinner" />
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
        <p style={{ fontSize: '1.2rem', color: 'var(--ink-muted)' }}>
          {t('Order not found', 'الطلب غير موجود')}
        </p>
      </div>
    )
  }

  const currentStageIdx = stages.findIndex((s) => s.key === order.status)
  const isCancelled = order.status === 'cancelled'
  const isDelivered = order.status === 'delivered'

  const handleReorder = async () => {
    if (!order?.order_items) return
    
    setReordering(true)
    try {
      clearCart()
      
      // Add all items from the order back to cart
      for (const item of order.order_items) {
        const product: Product = {
          id: item.product.id,
          name_en: item.product.name_en,
          name_ar: item.product.name_ar,
          base_price: item.product.base_price,
          image_url: item.product.image_url || null,
          category_id: '',
          description_en: '',
          description_ar: '',
          is_available: true,
          is_featured: false,
          prep_time_minutes: 15,
          calories: null,
          display_order: 0,
          stock_level: 0,
          low_stock_threshold: 0,
          stock_unit: 'pieces',
          last_stock_update: null,
          is_stock_tracked: false,
          created_at: '',
          updated_at: '',
          tags: [],
          modifier_groups: []
        }
        
        addItem(
          product,
          item.quantity,
          {},
          item.notes || ''
        )
      }
      
      navigate('/cart')
    } catch (error) {
      console.error('Failed to reorder:', error)
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="track-page">
      {/* Header */}
      <div className="track-header">
        <h1 className="track-title">
          {t(
            isHotelRoomDelivery ? 'Tracking Your Room Delivery' : 'Tracking Your Order',
            isHotelRoomDelivery ? 'تتبع توصيل الغرفة' : 'تتبع طلبك'
          )}
        </h1>
        <p className="track-order-num">#{order.id.slice(0, 8).toUpperCase()}</p>
        <p className="track-total">QAR {order.total.toFixed(2)}</p>
        {order.delivery_address && (
          <p className="track-location">
            {formatDeliveryAddressSummary(order.delivery_address as unknown as DeliveryAddress)}
          </p>
        )}
        {etaLabel && !isCancelled && !isDelivered && (
          <p className="track-eta">
            {t(
              isHotelRoomDelivery ? 'Estimated handoff around' : 'Estimated ready around',
              isHotelRoomDelivery ? 'متوقع التسليم حوالي' : 'متوقع الجاهزية حوالي'
            )} {etaLabel}
          </p>
        )}
      </div>

      {/* Cancelled state */}
      {isCancelled ? (
        <div className="status-card cancelled">
          <h2>{t('Order Cancelled', 'تم إلغاء الطلب')}</h2>
          <p>{t('We\'re sorry your order was cancelled. Please contact us for assistance.', 'نأسف لإلغاء طلبك. يرجى التواصل معنا للمساعدة.')}</p>
        </div>
      ) : (
        <>
          {/* Timeline */}
          <div className="timeline">
            {stages.map((stage, idx) => {
              const done = idx < currentStageIdx
              const active = idx === currentStageIdx
              const future = idx > currentStageIdx
              return (
                <div key={stage.key} className="timeline-item">
                  <div className="timeline-spine">
                    <div className={`timeline-dot ${done ? 'done' : active ? 'active' : 'future'}`}>
                      {done ? (
                        <CheckIcon />
                      ) : (
                        <span className="timeline-step-num">{idx + 1}</span>
                      )}
                    </div>
                    {idx < stages.length - 1 && (
                      <div className={`timeline-line ${done ? 'done' : 'future'}`} />
                    )}
                  </div>
                  <div className={`timeline-content ${future ? 'future' : ''}`}>
                    <p className={`timeline-label ${active ? 'active' : ''}`}>
                      {t(stage.labelEn, stage.labelAr)}
                    </p>
                    {active && stage.key === 'dispatched' && order.drivers && !isHotelRoomDelivery && (
                      <p className="timeline-driver">
                        {t('Driver:', 'السائق:')} {order.drivers.name}
                      </p>
                    )}
                    {active && (
                      <div className="active-pulse" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Delivered celebration */}
          {isDelivered && (
            <div className="status-card delivered">
              <h2>{t('Enjoy your meal', 'استمتع بوجبتك')}</h2>
              <p>{t('Your order has been delivered. Thank you for choosing us.', 'تم توصيل طلبك. شكراً لاختيارك لنا.')}</p>
              <button 
                className="reorder-btn"
                onClick={handleReorder}
                disabled={reordering}
              >
                {reordering ? t('Adding to cart...', 'جارٍ الإضافة إلى السلة...') : t('Order again', 'أعد الطلب')}
              </button>
            </div>
          )}

          {/* Driver info when dispatched */}
          {order.status === 'dispatched' && order.drivers && (
            <div className="driver-card">
              <div className="driver-avatar" aria-hidden />
              <div className="driver-info">
                <p className="driver-name">{order.drivers.name}</p>
                <p className="driver-sub">{t('Your driver is on the way', 'سائقك في الطريق إليك')}</p>
                {driverLocation ? (
                  <p className="driver-live-location">
                    {t('Live location', 'الموقع المباشر')}:{' '}
                    <a
                      href={mapsUrlForLocation(driverLocation.lat, driverLocation.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('View on map', 'عرض على الخريطة')}
                    </a>
                    {driverLocation.updated_at
                      ? ` · ${t('Updated', 'آخر تحديث')} ${new Date(driverLocation.updated_at).toLocaleTimeString(language === 'ar' ? 'ar-QA' : 'en-QA', { hour: '2-digit', minute: '2-digit' })}`
                      : null}
                  </p>
                ) : (
                  <p className="driver-live-location muted">
                    {t('Waiting for driver GPS…', 'بانتظار موقع السائق…')}
                  </p>
                )}
              </div>
              <a href={`tel:${order.drivers.phone_e164}`} className="driver-call" aria-label={t('Call driver', 'اتصل بالسائق')}>
                <PhoneIcon />
              </a>
            </div>
          )}
        </>
      )}

      <style>{`
        .track-page {
          max-width: 480px; margin: 0 auto;
          padding: 3rem 1.5rem 6rem;
        }

        .track-header { text-align: center; margin-bottom: 3rem; }
        .track-title {
          font-family: var(--font-display);
          font-size: 2.2rem; font-weight: 300;
          color: var(--ink); margin-bottom: 0.5rem;
        }
        .track-order-num {
          font-size: 0.8rem; letter-spacing: 0.15em;
          font-weight: 600; color: var(--ink-muted);
          font-family: monospace; margin-bottom: 0.25rem;
        }
        .track-total {
          font-size: 1.1rem; font-weight: 600; color: var(--gold-dark);
        }
        .track-location {
          font-size: 0.82rem;
          color: var(--ink-muted);
          margin-top: 0.5rem;
          line-height: 1.5;
        }
        .track-eta {
          font-size: 0.82rem;
          color: var(--ink-muted);
          margin-top: 0.6rem;
          font-weight: 500;
        }

        .timeline { display: flex; flex-direction: column; }

        .timeline-item {
          display: flex; gap: 1.25rem;
        }

        .timeline-spine {
          display: flex; flex-direction: column; align-items: center;
          flex-shrink: 0;
        }

        .timeline-dot {
          width: 44px; height: 44px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; flex-shrink: 0;
          transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .timeline-dot.done {
          background: var(--ink); color: var(--cream);
          border: 2px solid var(--ink);
          font-size: 0.85rem;
        }
        .timeline-dot.active {
          background: var(--gold);
          border: 2px solid var(--gold-dark);
          box-shadow: 0 0 0 6px rgba(184,151,90,0.15);
        }
        .timeline-dot.future {
          background: var(--cream-2); color: var(--ink-muted);
          border: 1px solid var(--border);
        }
        .timeline-dot svg {
          width: 18px;
          height: 18px;
        }
        .timeline-step-num {
          font-size: 0.75rem;
          font-weight: 700;
          color: inherit;
        }

        .timeline-line {
          width: 2px; flex: 1; min-height: 32px;
          margin: 4px 0;
          transition: background 0.4s ease;
        }
        .timeline-line.done { background: var(--ink); }
        .timeline-line.future { background: var(--cream-3); }

        .timeline-content {
          padding: 0.6rem 0 1.5rem;
          flex: 1;
        }
        .timeline-content.future { opacity: 0.45; }

        .timeline-label {
          font-size: 0.95rem; color: var(--ink); font-weight: 400;
          transition: font-weight 0.2s;
        }
        .timeline-label.active { font-weight: 600; }

        .timeline-driver {
          font-size: 0.78rem; color: var(--gold-dark);
          font-weight: 500; margin-top: 0.25rem;
        }

        .active-pulse {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--gold);
          margin-top: 0.4rem;
          animation: pulse-gold 1.8s infinite;
        }

        .status-card {
          text-align: center; padding: 2rem;
          border-radius: var(--radius-md);
          margin-top: 2rem;
        }
        .status-card.cancelled {
          background: var(--danger-muted); border: 1px solid var(--danger-border);
        }
        .status-card.cancelled h2 { color: var(--danger); }
        .status-card.delivered {
          background: var(--success-muted);
          border: 1px solid var(--success-border);
        }
        .status-card.delivered h2 { color: var(--success); }
        .status-card-icon { font-size: 2.5rem; display: block; margin-bottom: 0.75rem; }
        .status-card h2 {
          font-family: var(--font-display); font-size: 1.4rem;
          font-weight: 600; margin-bottom: 0.5rem;
        }
        .status-card p { font-size: 0.875rem; color: var(--ink-soft); line-height: 1.6; }

        .driver-live-location {
          margin: 0.35rem 0 0;
          font-size: 0.78rem;
          color: var(--ink-muted);
        }
        .driver-live-location a {
          color: var(--gold-dark);
          font-weight: 600;
        }
        .driver-live-location.muted {
          opacity: 0.85;
        }
        .driver-card {
          display: flex; align-items: center; gap: 1rem;
          margin-top: 1.5rem; padding: 1rem 1.25rem;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
        }
        .driver-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(184, 151, 90, 0.18);
          border: 1px solid rgba(184, 151, 90, 0.35);
        }
        .driver-info { flex: 1; }
        .driver-name { font-weight: 600; font-size: 0.95rem; color: var(--ink); }
        .driver-sub { font-size: 0.78rem; color: var(--ink-muted); }
        .driver-call {
          width: 40px; height: 40px; border-radius: 50%;
          background: var(--success-muted); border: 1px solid var(--success-border);
          display: flex; align-items: center; justify-content: center;
          text-decoration: none;
          color: var(--success);
        }
        .driver-call svg {
          width: 18px;
          height: 18px;
        }

        .track-spinner {
          width: 36px; height: 36px;
          border: 3px solid var(--cream-3);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .reorder-btn {
          margin-top: 1.5rem;
          padding: 0.75rem 1.5rem;
          background: var(--gold);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .reorder-btn:hover:not(:disabled) {
          background: var(--gold-dark);
          transform: translateY(-1px);
        }
        .reorder-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
