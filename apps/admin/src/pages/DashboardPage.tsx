// apps/admin/src/pages/DashboardPage.tsx
import { useState, useEffect, useRef } from 'react'
import {
  formatDeliveryAddressSummary,
  getOrderAdvanceLabel,
  getOrderNextStatus,
  isHotelFulfillmentOrder,
} from '@rms/supabase/fulfillment'
import { supabase } from '../lib/supabase'
import { getSupabaseFunctionErrorMessage } from '../lib/supabaseFunctionErrors'
import type { Order } from '../types'
import { asRows } from '../lib/supabaseTypeWorkarounds'
import { assignDriverToOrder, listDrivers, type DriverStatus } from '../services/drivers'
import OrderAvailabilityToggle from '../components/OrderAvailabilityToggle'
import type { StaffRole } from '../types'

type DashboardPageProps = {
  staffRole?: StaffRole | null
}

const STATUS_COLUMNS = [
  { key: 'pending',    label: 'Pending',    color: 'var(--amber)'  },
  { key: 'confirmed',  label: 'Confirmed',  color: 'var(--blue)'   },
  { key: 'preparing',  label: 'Preparing',  color: 'var(--purple)' },
  { key: 'ready',      label: 'Ready',      color: 'var(--green)'  },
  { key: 'dispatched', label: 'Dispatched', color: 'var(--gold)'   },
]

interface KPI {
  today_orders: number
  today_revenue: number
  avg_order_value: number
  pending_count: number
  active_count: number
  delivered_today: number
}

export default function DashboardPage({ staffRole = null }: DashboardPageProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [kpis, setKpis] = useState<KPI | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const actionInFlightRef = useRef(false)

  useEffect(() => {
    loadData()
    const channel = supabase
      .channel('admin:orders:dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData())
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  async function loadData() {
    const today = new Date(); today.setHours(0,0,0,0)
    try {
      const [ordersRes, kpiRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, customers(name, phone_e164), drivers!orders_driver_id_fkey(name, phone_e164), order_items(*)')
          .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'dispatched'])
          .order('created_at', { ascending: true }),
        supabase
          .from('orders')
          .select('status, total')
          .gte('created_at', today.toISOString()),
      ])

      if (ordersRes.error) throw ordersRes.error
      if (kpiRes.error) throw kpiRes.error

      setOrders((ordersRes.data ?? []) as unknown as Order[])

      const all = asRows<{ status: Order['status']; total: number }>(kpiRes.data)
      const delivered = all.filter((o) => o.status === 'delivered')
      const active = all.filter((o) => !['delivered','cancelled'].includes(o.status))
      const pending = all.filter((o) => o.status === 'pending')
      const revenue = delivered.reduce((s, o) => s + o.total, 0)
      setKpis({
        today_orders: all.length,
        today_revenue: revenue,
        avg_order_value: delivered.length > 0 ? revenue / delivered.length : 0,
        pending_count: pending.length,
        active_count: active.length,
        delivered_today: delivered.length,
      })
      setActionError(null)
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to load dashboard orders')
      setActionError(message)
      setOrders([])
      setKpis(null)
    } finally {
      setLoading(false)
    }
  }

  async function advanceStatus(order: Order, toStatus: string) {
    if (actionInFlightRef.current) {
      return false
    }

    actionInFlightRef.current = true
    setActionLoading(true)
    try {
      setActionError(null)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setActionError('Your admin session has expired. Please sign in again.')
        return false
      }
      const { error } = await supabase.functions.invoke('advance-order-status', {
        body: { order_id: order.id, to_status: toStatus },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error) throw error
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: toStatus as any } : o)))
      return true
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to update order status')
      console.error('Failed to advance order status:', message)
      setActionError(message)
      return false
    } finally {
      actionInFlightRef.current = false
      setActionLoading(false)
    }
  }

  const byStatus = STATUS_COLUMNS.reduce<Record<string, Order[]>>((acc, col) => {
    acc[col.key] = orders.filter((o) => o.status === col.key)
    return acc
  }, {})

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Operations Dashboard</h1>
          <p className="page-sub">Live view · {new Date().toLocaleDateString('en-QA', { weekday:'long', month:'long', day:'numeric' })}</p>
        </div>
        <div className="page-header-actions">
          <OrderAvailabilityToggle staffRole={staffRole} variant="compact" />
          <div className="live-indicator">
            <span className="live-dot" />
            <span>Live</span>
          </div>
        </div>
      </div>

      {actionError && <div className="action-error">{actionError}</div>}

      {/* KPIs */}
      {kpis && (
        <div className="kpi-grid">
          <KpiCard label="Today's Orders" value={kpis.today_orders} icon="◫" color="var(--blue)" />
          <KpiCard label="Revenue Today" value={`QAR ${kpis.today_revenue.toFixed(0)}`} icon="◈" color="var(--gold)" />
          <KpiCard label="Avg Order Value" value={`QAR ${kpis.avg_order_value.toFixed(0)}`} icon="◉" color="var(--purple)" />
          <KpiCard label="Awaiting Action" value={kpis.pending_count} icon="◬" color="var(--amber)" urgent={kpis.pending_count > 0} />
          <KpiCard label="Active Orders" value={kpis.active_count} icon="◰" color="var(--green)" />
          <KpiCard label="Delivered" value={kpis.delivered_today} icon="✓" color="var(--green)" />
        </div>
      )}

      {/* Kanban Board */}
      <div className="kanban-board">
        {STATUS_COLUMNS.map((col) => (
          <div key={col.key} className="kanban-col">
            <div className="kanban-col-header">
              <div className="kanban-col-dot" style={{ background: col.color }} />
              <span className="kanban-col-label">{col.label}</span>
              <span className="kanban-col-count">{byStatus[col.key]?.length ?? 0}</span>
            </div>
            <div className="kanban-cards">
              {loading ? (
                Array.from({length:2}).map((_, i) => (
                  <div key={i} className="kanban-skeleton" />
                ))
              ) : (
                (byStatus[col.key] ?? []).map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actionLoading={actionLoading}
                    onClick={() => setSelectedOrder(order)}
                    onAdvance={(to) => advanceStatus(order, to)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Order Detail Panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          actionLoading={actionLoading}
          onClose={() => setSelectedOrder(null)}
          onAdvance={async (to) => {
            const didAdvance = await advanceStatus(selectedOrder, to)
            if (didAdvance) setSelectedOrder(null)
          }}
        />
      )}

      <style>{`
        .dashboard { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; gap: 0.75rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; color: var(--text); }
        .page-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem; }
        .page-header-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; flex-shrink: 0; }
        .live-indicator { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; font-weight: 600; color: var(--green); padding: 0.35rem 0.75rem; background: var(--green-dim); border-radius: 20px; border: 1px solid rgba(34,197,94,0.2); }
        .action-error { margin-bottom: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: var(--red); font-size: 0.8rem; }

        .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
        @media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 640px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }

        .kanban-board { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; min-height: 400px; }
        @media (max-width: 1200px) { .kanban-board { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px)  { .kanban-board { grid-template-columns: 1fr; } }

        .kanban-col { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .kanban-col-header { display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
        .kanban-col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .kanban-col-label { flex: 1; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-soft); }
        .kanban-col-count { font-size: 0.72rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-muted); background: var(--bg-3); padding: 0.1rem 0.4rem; border-radius: 4px; }
        .kanban-cards { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
        .kanban-skeleton { height: 100px; background: var(--bg-3); border-radius: var(--radius); animation: pulse 1.5s infinite; }
        @media (max-width: 640px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
          }
          .page-header-actions {
            align-self: flex-start;
          }
          .kpi-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}

function KpiCard({ label, value, icon, color, urgent }: {
  label: string; value: string | number; icon: string; color: string; urgent?: boolean
}) {
  return (
    <div className={`kpi-card ${urgent ? 'urgent' : ''}`}>
      <div className="kpi-icon" style={{ color }}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      <style>{`
        .kpi-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 1rem;
          display: flex; flex-direction: column; gap: 0.25rem;
          transition: border-color var(--transition);
        }
        .kpi-card.urgent { border-color: rgba(245,158,11,0.4); animation: pulse 2s infinite; }
        .kpi-icon { font-size: 1.1rem; }
        .kpi-value { font-size: 1.4rem; font-weight: 700; color: var(--text); font-family: var(--font-mono); }
        .kpi-label { font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
      `}</style>
    </div>
  )
}

function OrderCard({ order, actionLoading, onClick, onAdvance }: {
  order: Order; actionLoading: boolean; onClick: () => void; onAdvance: (to: string) => void
}) {
  const isHotelOrder = isHotelFulfillmentOrder(order)
  const next = getOrderNextStatus(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery')
  const actionLabel = getOrderAdvanceLabel(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery')
  const dispatchBlocked = next === 'dispatched' && !order.driver_id
  const ageMin = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
  const isUrgent = ageMin > 30 && order.status !== 'dispatched'

  return (
    <div className={`order-card ${isUrgent ? 'urgent' : ''}`} onClick={onClick}>
      <div className="oc-header">
        <span className="oc-id mono">#{order.id.slice(0,8).toUpperCase()}</span>
        <span className={`oc-age ${isUrgent ? 'urgent' : ''}`}>{ageMin}m</span>
      </div>
      <div className="oc-customer">
        {(order.customer as { name?: string } | null)?.name ?? 'Guest'}
      </div>
      <div className="oc-total">QAR {order.total?.toFixed(2)}</div>
      {next && (
        <button
          className="oc-advance"
          disabled={actionLoading || dispatchBlocked}
          onClick={(e) => { e.stopPropagation(); onAdvance(next) }}
          title={dispatchBlocked ? 'Assign a driver before dispatching this order.' : undefined}
        >
          {actionLoading ? 'Updating…' : `${actionLabel ?? 'Advance'} →`}
        </button>
      )}
      <style>{`
        .order-card {
          background: var(--bg-3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 0.75rem;
          cursor: pointer; transition: all var(--transition);
        }
        .order-card:hover { border-color: var(--border-2); background: var(--bg-card); }
        .order-card.urgent { border-color: rgba(245,158,11,0.35); }
        .oc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
        .oc-id { font-size: 0.7rem; color: var(--text-muted); }
        .oc-age { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); background: var(--bg-2); padding: 0.1rem 0.35rem; border-radius: 4px; }
        .oc-age.urgent { color: var(--amber); background: var(--amber-dim); }
        .oc-customer { font-size: 0.82rem; font-weight: 600; color: var(--text); margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .oc-total { font-size: 0.72rem; color: var(--text-soft); font-family: var(--font-mono); margin-bottom: 0.6rem; }
        .oc-advance { width: 100%; padding: 0.4rem; background: var(--bg-2); border: 1px solid var(--border-2); border-radius: 6px; font-size: 0.7rem; font-weight: 700; color: var(--text-soft); transition: all var(--transition); text-align: center; }
        .oc-advance:hover { background: var(--blue); border-color: var(--blue); color: white; }
        .oc-advance:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}

function OrderDetailPanel({ order, actionLoading, onClose, onAdvance }: {
  order: Order; actionLoading: boolean; onClose: () => void; onAdvance: (to: string) => void
}) {
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string; status: DriverStatus }>>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    listDrivers()
      .then((data) => {
        if (!cancelled) {
          setDrivers(data.filter((driver) => driver.is_active))
        }
      })
      .catch((error) => {
        console.error('Failed to load drivers for dashboard assignment:', error)
        if (!cancelled) {
          setAssignmentError('Failed to load drivers')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function assignDriver() {
    if (!selectedDriver) return
    setAssigning(true)
    try {
      setAssignmentError(null)
      await assignDriverToOrder(order.id, selectedDriver)
      onClose()
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to assign driver')
      setAssignmentError(message)
    } finally {
      setAssigning(false)
    }
  }

  const isHotelOrder = isHotelFulfillmentOrder(order)
  const next = getOrderNextStatus(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery')
  const nextLabel = getOrderAdvanceLabel(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery')
  const canCancel = ['pending', 'confirmed'].includes(order.status)
  const dispatchBlocked = next === 'dispatched' && !order.driver_id

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dp-header">
          <div>
            <h2 className="dp-id mono">#{order.id.slice(0,8).toUpperCase()}</h2>
            <span className={`badge badge-${order.status}`}>{order.status}</span>
          </div>
          <button className="dp-close" onClick={onClose}>✕</button>
        </div>

        <div className="dp-section">
          <p className="dp-label">Customer</p>
          <p className="dp-val">{(order.customer as { name?: string; phone_e164?: string } | null)?.name ?? 'Guest'}</p>
          <p className="dp-val mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {(order.customer as { phone_e164?: string } | null)?.phone_e164}
          </p>
        </div>

        <div className="dp-section">
          <p className="dp-label">{isHotelOrder ? 'Room Delivery Details' : 'Delivery Address'}</p>
          <p className="dp-val" style={{ fontSize: '0.8rem' }}>
            {formatDeliveryAddressSummary(order.delivery_address)}
          </p>
        </div>

        <div className="dp-section">
          <p className="dp-label">Order Items</p>
          {((order.order_items ?? []) as Array<{ product_snapshot: { name_en?: string }; quantity: number; total_price: number }>).map((item, i) => (
            <div key={i} className="dp-item">
              <span>{item.product_snapshot?.name_en ?? 'Item'} × {item.quantity}</span>
              <span className="mono">QAR {item.total_price?.toFixed(2)}</span>
            </div>
          ))}
          <div className="dp-total">
            <span>Total</span>
            <span className="mono">QAR {order.total?.toFixed(2)}</span>
          </div>
        </div>

        {order.special_instructions && (
          <div className="dp-section">
            <p className="dp-label">Special Instructions</p>
            <p className="dp-val dp-instructions">{order.special_instructions}</p>
          </div>
        )}

        {/* Driver assignment */}
        {!isHotelOrder && ['ready', 'confirmed', 'preparing'].includes(order.status) && !order.driver_id && (
          <div className="dp-section">
            <p className="dp-label">Assign Driver</p>
            {assignmentError && (
              <div className="dp-error">{assignmentError}</div>
            )}
            <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={{ marginBottom: '0.5rem' }}>
              <option value="">Select driver...</option>
              {drivers.filter((d) => d.status === 'available').map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button className="btn btn-gold" onClick={assignDriver} disabled={!selectedDriver || assigning} style={{ width:'100%' }}>
              {assigning ? 'Assigning...' : 'Assign Driver'}
            </button>
          </div>
        )}

        {order.driver_id && (
          <div className="dp-section">
            <p className="dp-label">Driver</p>
            <p className="dp-val">{(order.driver as { name?: string } | null)?.name ?? 'Assigned'}</p>
          </div>
        )}

        {/* Actions */}
        {(next || canCancel) && (
          <div className="dp-actions">
            {next && (
            <button className="btn btn-primary" onClick={() => onAdvance(next)} disabled={actionLoading || dispatchBlocked} title={dispatchBlocked ? 'Assign a driver before dispatching this order.' : undefined}>
              {actionLoading ? 'Updating…' : `Advance → ${nextLabel ?? (next.charAt(0).toUpperCase() + next.slice(1))}`}
              </button>
            )}
            {canCancel && (
              <button className="btn btn-danger" onClick={() => onAdvance('cancelled')} disabled={actionLoading}>
                Cancel Order
              </button>
            )}
          </div>
        )}

        <style>{`
          .panel-backdrop { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.7); display: flex; justify-content: flex-end; animation: fadeIn 0.2s ease; }
          .detail-panel { width: 400px; max-width: 100vw; background: var(--bg-2); border-left: 1px solid var(--border); height: 100dvh; overflow-y: auto; animation: slideIn 0.25s ease; }
          @media (max-width: 480px) { .detail-panel { width: 100%; } }
          .dp-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem; border-bottom: 1px solid var(--border); }
          .dp-id { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; }
          .dp-close { width: 30px; height: 30px; border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
          .dp-close:hover { background: var(--bg-3); color: var(--text); }
          .dp-section { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
          .dp-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; }
          .dp-val { font-size: 0.875rem; color: var(--text); line-height: 1.5; }
          .dp-instructions { color: var(--text-soft); font-style: italic; }
          .dp-item { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-soft); padding: 0.2rem 0; }
          .dp-total { display: flex; justify-content: space-between; font-size: 0.875rem; font-weight: 700; color: var(--text); padding-top: 0.6rem; margin-top: 0.4rem; border-top: 1px solid var(--border); }
          .dp-error { margin-bottom: 0.5rem; padding: 0.6rem 0.75rem; border-radius: 8px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.18); color: var(--red); font-size: 0.72rem; }
          .dp-actions { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
          @media (max-width: 640px) {
            .dp-item,
            .dp-total {
              gap: 0.75rem;
              flex-wrap: wrap;
            }
          }
        `}</style>
      </div>
    </div>
  )
}
