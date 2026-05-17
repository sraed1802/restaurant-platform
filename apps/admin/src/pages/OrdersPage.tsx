// apps/admin/src/pages/OrdersPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTenantScope } from '@rms/platform'
import type { DeliveryAddress } from '@rms/supabase/types'
import {
  formatDeliveryAddressLines,
  getOrderAdvanceLabel,
  getOrderNextStatus,
  isHotelFulfillmentOrder,
} from '@rms/supabase/fulfillment'
import { supabase } from '../lib/supabase'
import { getSupabaseFunctionErrorMessage } from '../lib/supabaseFunctionErrors'
import TableSkeleton from '../components/TableSkeleton'
import { assignDriverToOrder, listDrivers, type DriverStatus } from '../services/drivers'
import { lookupHotelGuestByRoom, type HotelGuestRosterEntry } from '../services/hotelGuestRoster'
import DriverLiveLocationPanel from '../components/DriverLiveLocationPanel'

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'

interface Order {
  id: string
  customer_id?: string | null
  driver_id?: string | null
  fulfillment_mode?: 'outside_delivery' | 'hotel_room_delivery'
  status: OrderStatus
  total: number
  subtotal: number
  discount_amount: number
  delivery_fee: number
  payment_method: string
  payment_status: string
  special_instructions: string | null
  language_pref: string
  created_at: string
  confirmed_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  delivery_address: DeliveryAddress
  customer: { name: string | null; phone_e164: string; email?: string | null } | null
  driver: { name: string; phone_e164: string } | null
  order_items: Array<{
    id: string
    quantity: number
    unit_price: number
    total_price: number
    notes: string | null
    product_snapshot: { name_en: string; name_ar: string }
  }>
}

const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled']

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing',
  ready: 'Ready', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string; status: DriverStatus; is_active: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [assignmentLoadingOrderId, setAssignmentLoadingOrderId] = useState<string | null>(null)
  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({})
  const actionInFlightRef = useRef(false)

  const loadOrders = useCallback(async () => {
    try {
      let q = supabase
        .from('orders')
        .select(`
          id, customer_id, driver_id, fulfillment_mode, status, total, subtotal, discount_amount, delivery_fee,
          payment_method, payment_status, special_instructions, language_pref,
          created_at, confirmed_at, delivered_at, cancelled_at, cancellation_reason,
          delivery_address,
          customer:customers(name, phone_e164, email),
          driver:drivers!orders_driver_id_fkey(name, phone_e164),
          order_items(id, quantity, unit_price, total_price, notes, product_snapshot)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (filterStatus !== 'all') q = q.eq('status', filterStatus)

      const { data, error } = await q
      if (error) {
        throw error
      }

      setOrders((data ?? []) as unknown as Order[])
      setActionError(null)
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to load orders')
      setActionError(message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  const loadDrivers = useCallback(async () => {
    try {
      const data = await listDrivers()
      setDrivers(data.filter((driver) => driver.is_active))
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to load drivers')
      setActionError(message)
    }
  }, [])

  useEffect(() => {
    void loadOrders()
    void loadDrivers()
    const channel = supabase
      .channel('admin:orders:page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void loadOrders()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadDrivers()
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [loadDrivers, loadOrders])

  async function advanceStatus(orderId: string, toStatus: OrderStatus, reason?: string) {
    if (actionInFlightRef.current) {
      return
    }

    actionInFlightRef.current = true
    setActionLoading(true)
    try {
      setActionError(null)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setActionError('Your admin session has expired. Please sign in again.')
        return
      }
      const { error } = await supabase.functions.invoke('advance-order-status', {
        body: { order_id: orderId, to_status: toStatus, reason },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error) throw error

      // Optimistic UI: reflect immediately
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: toStatus } : o)))
      await loadOrders()
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: toStatus } : prev))
      }
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to update order status')
      console.error('Failed to advance order status:', message)
      setActionError(message)
    } finally {
      actionInFlightRef.current = false
      setActionLoading(false)
    }
  }

  async function assignDriver(orderId: string, driverId: string) {
    if (!driverId) return

    setAssignmentLoadingOrderId(orderId)
    try {
      setActionError(null)
      await assignDriverToOrder(orderId, driverId)
      setSelectedDrivers((prev) => ({ ...prev, [orderId]: '' }))
      await Promise.all([loadOrders(), loadDrivers()])
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to assign driver')
      setActionError(message)
    } finally {
      setAssignmentLoadingOrderId(null)
    }
  }

  const filtered = orders.filter((o) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      o.id.toLowerCase().includes(s) ||
      o.customer?.name?.toLowerCase().includes(s) ||
      o.customer?.phone_e164?.includes(s) ||
      o.id.slice(0, 8).toUpperCase().includes(search.toUpperCase())
    )
  })

  const counts = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s).length
    return acc
  }, {})

  return (
    <div className="orders-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-sub">{filtered.length} orders · Live updates enabled</p>
        </div>
      </div>

      {actionError && <div className="action-error">{actionError}</div>}

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="status-filters">
          <button
            className={`sf-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All <span className="sf-count">{orders.length}</span>
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              className={`sf-btn ${filterStatus === s ? 'active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {STATUS_LABEL[s]}
              {counts[s] > 0 && <span className="sf-count">{counts[s]}</span>}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          placeholder="Search by order ID, name, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Orders Table */}
      <div className="orders-table-wrap">
        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span>◫</span>
            <p>No orders found</p>
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Driver</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const age = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
                const isUrgent = age > 30 && !['delivered', 'cancelled', 'dispatched'].includes(order.status)
                const isHotelOrder = isHotelFulfillmentOrder(order)
                const next = getOrderNextStatus(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery')
                const nextLabel = next ? getOrderAdvanceLabel(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery') : null
                const canAssignDriver = !isHotelOrder && ['ready', 'confirmed', 'preparing'].includes(order.status) && !order.driver_id
                const availableDrivers = drivers.filter((driver) => driver.status === 'available')
                const unavailableDriverLabel = drivers.length > 0
                  ? 'No drivers are currently available'
                  : 'No drivers have been created yet'
                const dispatchBlocked = next === 'dispatched' && !order.driver_id
                return (
                  <tr
                    key={order.id}
                    className={`order-row ${isUrgent ? 'urgent' : ''}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td data-label="Order ID">
                      <span className="mono order-id">#{order.id.slice(0, 8).toUpperCase()}</span>
                    </td>
                    <td data-label="Customer">
                      <div className="customer-cell">
                        <span className="customer-name">
                          {order.customer?.name ?? order.customer?.email ?? (order.customer_id ? `Guest (${order.customer_id.slice(0, 8)})` : 'Guest')}
                        </span>
                        <span className="customer-phone mono">{order.customer?.phone_e164 ?? '—'}</span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status]}</span>
                    </td>
                    <td data-label="Driver">
                      {isHotelOrder ? (
                        <span className="driver-pill idle">In-house</span>
                      ) : order.driver ? (
                        <div className="driver-cell">
                          <span className="driver-name">{order.driver.name}</span>
                          <span className="driver-phone mono">{order.driver.phone_e164}</span>
                        </div>
                      ) : (
                        <span className={`driver-pill ${canAssignDriver ? 'unassigned' : 'idle'}`}>
                          {canAssignDriver ? 'Unassigned' : 'No driver'}
                        </span>
                      )}
                    </td>
                    <td data-label="Items">
                      <span className="item-count">{order.order_items?.length ?? 0} item{order.order_items?.length !== 1 ? 's' : ''}</span>
                    </td>
                    <td data-label="Total">
                      <span className="mono order-total">QAR {order.total.toFixed(2)}</span>
                    </td>
                    <td data-label="Payment">
                      <div className="payment-cell">
                        <span className="payment-method">{order.payment_method}</span>
                        <span className={`payment-status ${order.payment_status}`}>{order.payment_status}</span>
                      </div>
                    </td>
                    <td data-label="Time">
                      <div className="time-cell">
                        <span className={`order-age ${isUrgent ? 'urgent' : ''}`}>{age}m ago</span>
                        <span className="order-time">{new Date(order.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td data-label="Actions" onClick={(e) => e.stopPropagation()}>
                      <div className="action-cell">
                        {canAssignDriver && (
                          <>
                            <select
                              value={selectedDrivers[order.id] ?? ''}
                              className="inline-driver-select"
                              onChange={(e) => setSelectedDrivers((prev) => ({ ...prev, [order.id]: e.target.value }))}
                            >
                              <option value="">Assign driver…</option>
                              {availableDrivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn btn-gold"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.68rem' }}
                              disabled={!selectedDrivers[order.id] || assignmentLoadingOrderId === order.id}
                              onClick={() => assignDriver(order.id, selectedDrivers[order.id] ?? '')}
                            >
                              {assignmentLoadingOrderId === order.id ? 'Assigning…' : 'Assign'}
                            </button>
                            {availableDrivers.length === 0 && (
                              <span className="inline-driver-hint">{unavailableDriverLabel}</span>
                            )}
                          </>
                        )}
                        {next && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.68rem' }}
                            disabled={actionLoading || dispatchBlocked}
                            onClick={() => advanceStatus(order.id, next)}
                            title={dispatchBlocked ? 'Assign a driver before dispatching this order.' : undefined}
                          >
                            → {nextLabel ?? STATUS_LABEL[next]}
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(order.status) && (
                          <button
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.68rem' }}
                            disabled={actionLoading}
                            onClick={() => advanceStatus(order.id, 'cancelled', 'Admin cancellation')}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selectedOrder && (
        <OrderDetailSlider
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAdvance={(to, reason) => advanceStatus(selectedOrder.id, to, reason)}
          actionLoading={actionLoading}
        />
      )}

      <style>{`
        .orders-page { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; gap: 0.75rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; }
        .page-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }

        .action-error { margin-bottom: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: var(--red); font-size: 0.8rem; }
        .filter-bar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .status-filters { display: flex; gap: 0.25rem; flex-wrap: wrap; flex: 1; }
        .sf-btn { padding: 0.35rem 0.7rem; border-radius: 6px; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); border: 1px solid transparent; display: flex; align-items: center; gap: 0.35rem; transition: all var(--transition); }
        .sf-btn:hover { color: var(--text); background: var(--bg-3); }
        .sf-btn.active { background: var(--bg-3); color: var(--text); border-color: var(--border-2); }
        .sf-count { background: var(--bg-2); border-radius: 4px; padding: 0.05rem 0.35rem; font-size: 0.62rem; }
        .search-input { width: 260px; padding: 0.45rem 0.75rem; font-size: 0.78rem; }

        .orders-table-wrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; overflow-x: auto; }
        .orders-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .orders-table thead tr { background: var(--bg-2); border-bottom: 1px solid var(--border-2); }
        .orders-table th { padding: 0.65rem 1rem; text-align: left; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); white-space: nowrap; }
        .order-row { border-bottom: 1px solid var(--border); cursor: pointer; transition: background var(--transition); }
        .order-row:last-child { border-bottom: none; }
        .order-row:hover { background: var(--bg-3); }
        .order-row.urgent { background: rgba(245,158,11,0.04); }
        .order-row.urgent:hover { background: rgba(245,158,11,0.08); }
        .orders-table td { padding: 0.75rem 1rem; vertical-align: middle; }

        .order-id { color: var(--text-soft); font-size: 0.72rem; }
        .customer-cell { display: flex; flex-direction: column; gap: 0.15rem; }
        .customer-name { font-weight: 600; color: var(--text); }
        .customer-phone { font-size: 0.68rem; color: var(--text-muted); }
        .driver-cell { display: flex; flex-direction: column; gap: 0.15rem; }
        .driver-name { font-weight: 600; color: var(--text); }
        .driver-phone { font-size: 0.68rem; color: var(--text-muted); }
        .driver-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.2rem 0.55rem; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
        .driver-pill.unassigned { background: var(--amber-dim); color: var(--amber); }
        .driver-pill.idle { background: rgba(100,116,139,0.14); color: var(--text-muted); }
        .item-count { font-size: 0.75rem; color: var(--text-soft); }
        .order-total { color: var(--text); font-weight: 600; }
        .payment-cell { display: flex; flex-direction: column; gap: 0.15rem; }
        .payment-method { font-size: 0.72rem; color: var(--text-soft); text-transform: capitalize; }
        .payment-status { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .payment-status.paid { color: var(--green); }
        .payment-status.pending { color: var(--amber); }
        .payment-status.failed { color: var(--red); }
        .time-cell { display: flex; flex-direction: column; gap: 0.15rem; }
        .order-age { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); }
        .order-age.urgent { color: var(--amber); font-weight: 700; }
        .order-time { font-size: 0.65rem; color: var(--text-muted); }
        .action-cell { display: flex; gap: 0.35rem; align-items: center; }
        .inline-driver-select { min-width: 140px; font-size: 0.72rem; padding: 0.35rem 0.55rem; }
        .inline-driver-hint { font-size: 0.68rem; color: var(--amber); max-width: 170px; line-height: 1.35; }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 4rem; color: var(--text-muted); }
        .empty-state span { font-size: 2rem; }
        .empty-state p { font-size: 0.875rem; }

        @media (max-width: 760px) {
          .filter-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .search-input {
            width: 100%;
          }

          .orders-table-wrap {
            background: transparent;
            border: none;
            border-radius: 0;
            overflow: visible;
          }

          .orders-table,
          .orders-table tbody {
            display: block;
          }

          .orders-table thead {
            display: none;
          }

          .order-row {
            display: block;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            margin-bottom: 0.75rem;
            padding: 0.2rem 0;
          }

          .orders-table td {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr);
            gap: 0.75rem;
            padding: 0.65rem 0.85rem;
            border-bottom: 1px solid var(--border);
            align-items: start;
          }

          .orders-table td:last-child {
            border-bottom: none;
          }

          .orders-table td::before {
            content: attr(data-label);
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--text-muted);
          }

          .orders-table td[data-label="Actions"] {
            grid-template-columns: 1fr;
          }

          .orders-table td[data-label="Actions"]::before {
            margin-bottom: 0.25rem;
          }

          .action-cell {
            flex-wrap: wrap;
          }

          .inline-driver-select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}

function OrderDetailSlider({ order, onClose, onAdvance, actionLoading }: {
  order: Order
  onClose: () => void
  onAdvance: (to: OrderStatus, reason?: string) => void
  actionLoading: boolean
}) {
  const tenantScope = useTenantScope()
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string; status: DriverStatus; is_active: boolean }>>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [guestMatches, setGuestMatches] = useState<HotelGuestRosterEntry[]>([])
  const [guestLookupLoading, setGuestLookupLoading] = useState(false)
  const isHotelOrder = isHotelFulfillmentOrder(order)
  const deliveryAddressLines = formatDeliveryAddressLines(order.delivery_address)
  const roomNumber = isHotelOrder && 'room_number' in (order.delivery_address ?? {})
    ? String((order.delivery_address as { room_number?: string }).room_number ?? '')
    : ''

  useEffect(() => {
    let cancelled = false

    if (isHotelOrder || !['ready', 'confirmed', 'preparing'].includes(order.status)) {
      setDrivers([])
      return () => {
        cancelled = true
      }
    }

    listDrivers()
      .then((data) => {
        if (!cancelled) {
          setDrivers(data.filter((driver) => driver.is_active))
        }
      })
      .catch((error) => {
        console.error('Failed to load assignable drivers:', error)
        if (!cancelled) {
          setAssignmentError('Failed to load drivers')
        }
      })

    return () => {
      cancelled = true
    }
  }, [isHotelOrder, order.status])

  useEffect(() => {
    let cancelled = false

    if (!isHotelOrder || !roomNumber.trim()) {
      setGuestMatches([])
      return () => {
        cancelled = true
      }
    }

    setGuestLookupLoading(true)
    lookupHotelGuestByRoom({
      scope: tenantScope,
      roomNumber,
    })
      .then((entries) => {
        if (!cancelled) {
          setGuestMatches(entries)
        }
      })
      .catch((error) => {
        console.error('Failed to lookup hotel guest roster:', error)
        if (!cancelled) {
          setGuestMatches([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGuestLookupLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isHotelOrder, roomNumber, tenantScope])

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
 
  async function markPaymentPaid() {
    setMarkingPaid(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.functions.invoke('mark-payment-collected', {
        body: { order_id: order.id, payment_status: 'paid' },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) throw error
      onClose()
    } finally {
      setMarkingPaid(false)
    }
  }

  const next = getOrderNextStatus(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery')
  const nextLabel = next ? getOrderAdvanceLabel(order.status, isHotelOrder ? 'hotel_room_delivery' : 'outside_delivery') : null
  const availableDrivers = drivers.filter((driver) => driver.status === 'available')
  const unavailableDriverLabel = drivers.length > 0
    ? 'No drivers are currently available. Set one to Available from Drivers.'
    : 'No drivers have been created yet.'
  const canCancel = ['pending', 'confirmed'].includes(order.status)
  const dispatchBlocked = next === 'dispatched' && !order.driver_id
  const duration = order.confirmed_at && order.delivered_at
    ? Math.floor((new Date(order.delivered_at).getTime() - new Date(order.confirmed_at).getTime()) / 60000)
    : null

  return (
    <div className="slider-backdrop" onClick={onClose}>
      <aside className="order-slider" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sl-header">
          <div>
            <p className="sl-id mono">#{order.id.slice(0, 8).toUpperCase()}</p>
            <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status]}</span>
          </div>
          <button className="sl-close" onClick={onClose}>✕</button>
        </div>

        <div className="sl-body">
          {/* Timing */}
          <div className="sl-section">
            <p className="sl-label">Timeline</p>
            <div className="timing-grid">
              <div className="timing-item">
                <span className="timing-key">Placed</span>
                <span className="timing-val mono">{new Date(order.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {order.confirmed_at && (
                <div className="timing-item">
                  <span className="timing-key">Confirmed</span>
                  <span className="timing-val mono">{new Date(order.confirmed_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {order.delivered_at && (
                <div className="timing-item">
                  <span className="timing-key">Delivered</span>
                  <span className="timing-val mono">{new Date(order.delivered_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {duration !== null && (
                <div className="timing-item">
                  <span className="timing-key">Duration</span>
                  <span className="timing-val mono" style={{ color: duration > 45 ? 'var(--red)' : 'var(--green)' }}>{duration}m</span>
                </div>
              )}
            </div>
          </div>

          {/* Customer */}
          <div className="sl-section">
            <p className="sl-label">Customer</p>
            <p className="sl-val">{order.customer?.name ?? order.customer?.email ?? 'Guest'}</p>
            <p className="sl-val mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{order.customer?.phone_e164 ?? '—'}</p>
            <p className="sl-val" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
              🌍 {order.language_pref.toUpperCase()}
            </p>
          </div>

          {/* Address */}
          <div className="sl-section">
            <p className="sl-label">{isHotelOrder ? 'Room Delivery Details' : 'Delivery Address'}</p>
            <p className="sl-val" style={{ lineHeight: 1.7 }}>
              {deliveryAddressLines.map((line, index) => (
                <span key={`${line}-${index}`}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
          </div>

          {order.driver_id && order.status === 'dispatched' ? (
            <DriverLiveLocationPanel driverId={order.driver_id} enabled />
          ) : null}

          {isHotelOrder && (
            <div className="sl-section">
              <p className="sl-label">Guest roster match</p>
              {guestLookupLoading ? (
                <p className="sl-val" style={{ color: 'var(--text-muted)' }}>Looking up room roster...</p>
              ) : guestMatches.length > 0 ? (
                <div className="guest-match-list">
                  {guestMatches.map((entry) => (
                    <div key={entry.id} className="guest-match-card">
                      <strong>{entry.guest_name}</strong>
                      <span>Room {entry.room_number}</span>
                      {entry.phone && <span>{entry.phone}</span>}
                      {entry.email && <span>{entry.email}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sl-val" style={{ color: 'var(--text-muted)' }}>
                  No guest roster entry matched this room number yet.
                </p>
              )}
            </div>
          )}

          {/* Items */}
          <div className="sl-section">
            <p className="sl-label">Order Items</p>
            <div className="items-list">
              {order.order_items?.map((item) => (
                <div key={item.id} className="item-row">
                  <span className="item-qty">{item.quantity}×</span>
                  <span className="item-name">{item.product_snapshot?.name_en}</span>
                  <span className="item-price mono">QAR {item.total_price.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="order-financials">
              <div className="fin-row"><span>Subtotal</span><span className="mono">QAR {order.subtotal.toFixed(2)}</span></div>
              {order.discount_amount > 0 && (
                <div className="fin-row" style={{ color: 'var(--green)' }}><span>Discount</span><span className="mono">− QAR {order.discount_amount.toFixed(2)}</span></div>
              )}
              <div className="fin-row"><span>Delivery</span><span className="mono">QAR {order.delivery_fee.toFixed(2)}</span></div>
              <div className="fin-row grand"><span>Total</span><span className="mono">QAR {order.total.toFixed(2)}</span></div>
            </div>
          </div>

          {/* Special instructions */}
          {order.special_instructions && (
            <div className="sl-section">
              <p className="sl-label">Special Instructions</p>
              <p className="sl-val sl-instructions">{order.special_instructions}</p>
            </div>
          )}

          {/* Payment */}
          <div className="sl-section">
            <p className="sl-label">Payment</p>
            <div className="timing-grid">
              <div className="timing-item">
                <span className="timing-key">Method</span>
                <span className="timing-val" style={{ textTransform: 'capitalize' }}>{order.payment_method}</span>
              </div>
              <div className="timing-item">
                <span className="timing-key">Status</span>
                <span className={`timing-val payment-status ${order.payment_status}`}>{order.payment_status}</span>
              </div>
            </div>
            {order.payment_method === 'cash' && order.payment_status !== 'paid' && (
              <button
                type="button"
                className="btn btn-gold"
                style={{ width: '100%', marginTop: '0.75rem' }}
                onClick={markPaymentPaid}
                disabled={markingPaid}
              >
                {markingPaid ? 'Marking…' : 'Mark cash collected (Paid)'}
              </button>
            )}
          </div>

          {/* Driver */}
          {!isHotelOrder && order.driver ? (
            <div className="sl-section">
              <p className="sl-label">Driver</p>
              <div className="driver-info-box">
                <span>🛵</span>
                <div>
                  <p className="sl-val">{order.driver.name}</p>
                  <p className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{order.driver.phone_e164}</p>
                </div>
                <a href={`tel:${order.driver.phone_e164}`} className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', marginLeft: 'auto' }}>
                  Call
                </a>
              </div>
            </div>
          ) : !isHotelOrder ? (
            ['ready', 'confirmed', 'preparing'].includes(order.status) && (
              <div className="sl-section">
                <p className="sl-label">Assign Driver</p>
                {assignmentError && (
                  <div className="slider-error">{assignmentError}</div>
                )}
                <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={{ marginBottom: '0.5rem' }}>
                  <option value="">Select available driver…</option>
                  {availableDrivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {availableDrivers.length === 0 && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--amber)', marginBottom: '0.5rem' }}>
                    {unavailableDriverLabel}
                  </p>
                )}
                <button className="btn btn-gold" style={{ width: '100%' }} onClick={assignDriver} disabled={!selectedDriver || assigning}>
                  {assigning ? 'Assigning…' : 'Assign Driver'}
                </button>
              </div>
            )
          ) : null}

          {/* Cancellation reason */}
          {order.cancellation_reason && (
            <div className="sl-section">
              <p className="sl-label">Cancellation Reason</p>
              <p className="sl-val sl-instructions" style={{ color: 'var(--red)' }}>{order.cancellation_reason}</p>
            </div>
          )}
        </div>

        {/* Actions footer */}
        {!['delivered', 'cancelled'].includes(order.status) && (
          <div className="sl-footer">
            {next && (
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => onAdvance(next)}
                disabled={actionLoading || dispatchBlocked}
                title={dispatchBlocked ? 'Assign a driver before dispatching this order.' : undefined}
              >
                {actionLoading ? '…' : `→ ${nextLabel ?? STATUS_LABEL[next]}`}
              </button>
            )}
            {canCancel && !showCancel && (
              <button className="btn btn-danger" onClick={() => setShowCancel(true)}>
                Cancel
              </button>
            )}
            {showCancel && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Cancellation reason (required)…"
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-danger" style={{ flex: 1 }} disabled={!cancelReason || actionLoading}
                    onClick={() => { onAdvance('cancelled', cancelReason); setShowCancel(false) }}>
                    Confirm Cancel
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowCancel(false)}>Back</button>
                </div>
              </div>
            )}
          </div>
        )}

        <style>{`
          .slider-backdrop { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.65); display: flex; justify-content: flex-end; animation: fadeIn 0.2s ease; }
          .order-slider { width: 420px; max-width: 100vw; background: var(--bg-2); border-left: 1px solid var(--border); height: 100dvh; display: flex; flex-direction: column; animation: slideIn 0.25s ease; }
          @media (max-width: 480px) { .order-slider { width: 100vw; } }
          .sl-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
          .sl-id { font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 0.4rem; }
          .sl-close { width: 28px; height: 28px; border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
          .sl-close:hover { background: var(--bg-3); color: var(--text); }
          .sl-body { flex: 1; overflow-y: auto; }
          .sl-section { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
          .sl-label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; }
          .sl-val { font-size: 0.875rem; color: var(--text); line-height: 1.5; }
          .sl-instructions { font-style: italic; color: var(--text-soft); }
          .slider-error { margin-bottom: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 8px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.18); color: var(--red); font-size: 0.72rem; }
          .timing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
          .timing-item { background: var(--bg-3); border-radius: 6px; padding: 0.5rem 0.75rem; }
          .timing-key { display: block; font-size: 0.6rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.2rem; }
          .timing-val { font-size: 0.82rem; color: var(--text); font-weight: 600; }
          .items-list { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
          .item-row { display: flex; align-items: baseline; gap: 0.5rem; }
          .item-qty { font-size: 0.72rem; color: var(--text-muted); flex-shrink: 0; }
          .item-name { flex: 1; font-size: 0.82rem; color: var(--text-soft); }
          .item-price { font-size: 0.78rem; color: var(--text); flex-shrink: 0; }
          .order-financials { border-top: 1px solid var(--border); padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem; }
          .fin-row { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-soft); }
          .fin-row.grand { font-size: 0.95rem; font-weight: 700; color: var(--text); padding-top: 0.4rem; border-top: 1px solid var(--border); margin-top: 0.2rem; }
          .driver-info-box { display: flex; align-items: center; gap: 0.75rem; background: var(--bg-3); border-radius: 8px; padding: 0.75rem; }
          .guest-match-list { display: grid; gap: 0.6rem; }
          .guest-match-card { display: grid; gap: 0.15rem; padding: 0.75rem; background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; font-size: 0.76rem; color: var(--text-soft); }
          .guest-match-card strong { color: var(--text); font-size: 0.82rem; }
          .sl-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; flex-wrap: wrap; flex-shrink: 0; background: var(--bg-2); }
          @media (max-width: 640px) {
            .timing-grid {
              grid-template-columns: 1fr;
            }
            .driver-info-box {
              flex-wrap: wrap;
            }
            .sl-footer {
              flex-direction: column;
            }
            .sl-footer .btn {
              width: 100%;
            }
          }
        `}</style>
      </aside>
    </div>
  )
}
