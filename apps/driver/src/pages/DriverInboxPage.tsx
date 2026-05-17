import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getSupabaseFunctionErrorMessage } from '../lib/supabaseFunctionErrors'
import {
  getDriverInbox,
  runDriverAction,
  type DriverNotification,
  type DriverOrderSummary,
  type DriverStatus,
} from '../services/driverInbox'
import { useDriverUiStore } from '../store/driverUiStore'
import { useDriverRealtimeAlerts } from '../hooks/useDriverRealtimeAlerts'
import { useDriverLocationPublisher } from '../hooks/useDriverLocationPublisher'
import InAppAlertStack from '../components/InAppAlertStack'
import { isNativeDriverApp } from '../lib/nativeDriverShell'
import { requestNativeNotificationPermission } from '@rms/platform'

const DRIVER_STATUS_OPTIONS: DriverStatus[] = ['available', 'break', 'offline']

function formatMoney(value: number): string {
  return `QAR ${Number(value ?? 0).toFixed(2)}`
}

function formatAddress(address: Record<string, string | undefined>): string {
  const parts = [
    address.street,
    address.building ? `Bldg ${address.building}` : null,
    address.floor ? `Floor ${address.floor}` : null,
    address.apartment ? `Apt ${address.apartment}` : null,
    address.area,
  ]
  return parts.filter(Boolean).join(', ') || 'Address not provided'
}

function isAssignmentPending(notifications: DriverNotification[], orderId: string): boolean {
  return notifications.some(
    (notification) =>
      notification.order_id === orderId &&
      notification.event_type === 'order.assigned' &&
      !notification.acknowledged_at
  )
}

export default function DriverInboxPage({
  userEmail,
  onSignOut,
}: {
  userEmail?: string
  onSignOut: () => Promise<void>
}) {
  const selectedOrderId = useDriverUiStore((state) => state.selectedOrderId)
  const setSelectedOrderId = useDriverUiStore((state) => state.setSelectedOrderId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [queryErrorMessage, setQueryErrorMessage] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver', 'inbox'],
    queryFn: getDriverInbox,
    refetchInterval: 60000,
    retry: false,
  })

  const { alerts, dismissAlert } = useDriverRealtimeAlerts(data?.driver.id)
  useDriverLocationPublisher({
    enabled: isNativeDriverApp(),
    driverStatus: data?.driver.status,
  })

  useEffect(() => {
    if (isNativeDriverApp()) {
      void requestNativeNotificationPermission()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!error) {
      setQueryErrorMessage(null)
      return
    }

    void getSupabaseFunctionErrorMessage(error, 'Failed to load driver inbox').then((message) => {
      if (!cancelled) {
        setQueryErrorMessage(message)
      }
    })

    return () => {
      cancelled = true
    }
  }, [error])

  useEffect(() => {
    const activeOrders = data?.active_orders ?? []
    if (activeOrders.length === 0) {
      if (selectedOrderId) {
        setSelectedOrderId(null)
      }
      return
    }

    const stillExists = activeOrders.some((order) => order.id === selectedOrderId)
    if (!selectedOrderId || !stillExists) {
      setSelectedOrderId(activeOrders[0].id)
    }
  }, [data?.active_orders, selectedOrderId, setSelectedOrderId])

  useEffect(() => {
    const driverId = data?.driver.id
    if (!driverId) return

    const channel = supabase
      .channel(`driver-inbox:${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_notifications',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          void refetch()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
          filter: `id=eq.${driverId}`,
        },
        () => {
          void refetch()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [data?.driver.id, refetch])

  const activeOrders = data?.active_orders ?? []
  const recentOrders = data?.recent_orders ?? []
  const notifications = data?.notifications ?? []
  const unreadNotifications = notifications.filter((notification) => !notification.acknowledged_at)
  const cashDueCount = activeOrders.filter(
    (order) => order.payment_method === 'cash' && order.payment_status !== 'paid'
  ).length
  const selectedOrder = useMemo(
    () => activeOrders.find((order) => order.id === selectedOrderId) ?? activeOrders[0] ?? null,
    [activeOrders, selectedOrderId]
  )

  async function performOrderAction(
    key: string,
    input: { action: 'accept_assignment' | 'mark_delivered' | 'mark_cash_collected'; order_id: string }
  ) {
    setActionKey(key)
    try {
      setActionError(null)
      await runDriverAction(input)
      await refetch()
    } catch (actionFailure) {
      const message = await getSupabaseFunctionErrorMessage(actionFailure, 'Driver action failed')
      setActionError(message)
    } finally {
      setActionKey(null)
    }
  }

  async function updateDriverStatus(status: DriverStatus) {
    setActionKey(`status:${status}`)
    try {
      setActionError(null)
      await runDriverAction({ action: 'set_driver_status', status })
      await refetch()
    } catch (actionFailure) {
      const message = await getSupabaseFunctionErrorMessage(actionFailure, 'Failed to update status')
      setActionError(message)
    } finally {
      setActionKey(null)
    }
  }

  if (isLoading) {
    return (
      <div className="driver-loading">
        <div className="driver-spinner" />
        <p>Loading your deliveries…</p>
      </div>
    )
  }

  if (!data || queryErrorMessage) {
    return (
      <div className="driver-empty-state">
        <div className="empty-card">
          <h1>Driver access required</h1>
          <p>{queryErrorMessage ?? 'This account is not linked to an active driver profile yet.'}</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => void refetch()}>Retry</button>
            <button className="btn btn-ghost" onClick={() => void onSignOut()}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="driver-page">
      <header className="driver-header">
        <div>
          <p className="eyebrow">Driver Module</p>
          <h1>{data.driver.name}</h1>
          <p className="driver-sub">{userEmail ?? data.driver.login_email ?? data.driver.phone_e164}</p>
        </div>
        <div className="driver-header-actions">
          <label className="status-control">
            <span>Status</span>
            <select
              value={data.driver.status}
              onChange={(e) => void updateDriverStatus(e.target.value as DriverStatus)}
              disabled={actionKey?.startsWith('status:') || data.driver.status === 'busy'}
            >
              {data.driver.status === 'busy' && <option value="busy">Busy</option>}
              {DRIVER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-ghost" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </header>

      {actionError && <div className="page-error">{actionError}</div>}

      <section className="driver-summary-grid">
        <div className="summary-card">
          <span className="summary-label">Active orders</span>
          <strong>{activeOrders.length}</strong>
          <p>Assigned deliveries awaiting action.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Unread alerts</span>
          <strong>{unreadNotifications.length}</strong>
          <p>New assignment or workflow updates.</p>
        </div>
        <div className="summary-card">
          <span className="summary-label">Cash due</span>
          <strong>{cashDueCount}</strong>
          <p>Orders that still need cash collection.</p>
        </div>
      </section>

      <section className="notification-strip">
        {notifications.slice(0, 3).map((notification) => (
          <button
            key={notification.id}
            className={`notification-card ${notification.acknowledged_at ? 'read' : 'unread'}`}
            onClick={() => setSelectedOrderId(notification.order_id)}
          >
            <span className="notification-title">{notification.title}</span>
            <span className="notification-message">{notification.message}</span>
            <span className="notification-time">
              {new Date(notification.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </button>
        ))}
        {notifications.length === 0 && (
          <div className="notification-card read">
            <span className="notification-title">No driver alerts yet</span>
            <span className="notification-message">New assignments will appear here in real time.</span>
          </div>
        )}
      </section>

      <section className="driver-layout">
        <div className="inbox-column">
          <div className="section-heading">
            <h2>Assigned orders</h2>
            <span>{activeOrders.length}</span>
          </div>
          {activeOrders.length === 0 ? (
            <div className="panel-empty">
              <p>No active deliveries right now.</p>
              <span>Stay available to receive new assignments.</span>
            </div>
          ) : (
            <div className="order-list">
              {activeOrders.map((order) => {
                const pendingAcceptance = isAssignmentPending(notifications, order.id)
                return (
                  <button
                    key={order.id}
                    className={`order-card ${selectedOrder?.id === order.id ? 'selected' : ''}`}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <div className="order-card-top">
                      <span className="order-number mono">#{order.id.slice(0, 8).toUpperCase()}</span>
                      <span className={`badge badge-${order.status}`}>{order.status}</span>
                    </div>
                    <p className="order-card-customer">
                      {order.customer?.name ?? order.customer?.phone_e164 ?? 'Guest customer'}
                    </p>
                    <p className="order-card-address">{formatAddress(order.delivery_address)}</p>
                    <div className="order-card-meta">
                      <span>{formatMoney(order.total)}</span>
                      <span>{order.payment_method}</span>
                      {pendingAcceptance && <span className="pill warning">Needs acceptance</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="detail-column">
          {selectedOrder ? (
            <div className="detail-card">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Selected order</p>
                  <h2 className="mono">#{selectedOrder.id.slice(0, 8).toUpperCase()}</h2>
                </div>
                <span className={`badge badge-${selectedOrder.status}`}>{selectedOrder.status}</span>
              </div>

              <div className="detail-grid">
                <div className="detail-block">
                  <span className="detail-label">Customer</span>
                  <strong>{selectedOrder.customer?.name ?? 'Guest customer'}</strong>
                  <a className="mono detail-link" href={`tel:${selectedOrder.customer?.phone_e164 ?? ''}`}>
                    {selectedOrder.customer?.phone_e164 ?? 'No phone available'}
                  </a>
                </div>
                <div className="detail-block">
                  <span className="detail-label">Payment</span>
                  <strong>{selectedOrder.payment_method}</strong>
                  <span>{selectedOrder.payment_status}</span>
                </div>
              </div>

              <div className="detail-block">
                <span className="detail-label">Delivery address</span>
                <strong>{formatAddress(selectedOrder.delivery_address)}</strong>
                {selectedOrder.delivery_address.instructions && (
                  <span>{selectedOrder.delivery_address.instructions}</span>
                )}
              </div>

              {selectedOrder.special_instructions && (
                <div className="detail-block">
                  <span className="detail-label">Kitchen note</span>
                  <strong>{selectedOrder.special_instructions}</strong>
                </div>
              )}

              <div className="detail-block">
                <span className="detail-label">Items</span>
                <div className="item-list">
                  {(selectedOrder.order_items ?? []).map((item) => (
                    <div key={item.id} className="detail-item-row">
                      <span>{item.quantity}x {item.product_snapshot?.name_en ?? item.product_snapshot?.name_ar ?? 'Item'}</span>
                      <span className="mono">{formatMoney(item.total_price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-actions">
                {isAssignmentPending(notifications, selectedOrder.id) && (
                  <button
                    className="btn btn-primary"
                    onClick={() => void performOrderAction(`accept:${selectedOrder.id}`, { action: 'accept_assignment', order_id: selectedOrder.id })}
                    disabled={actionKey === `accept:${selectedOrder.id}`}
                  >
                    {actionKey === `accept:${selectedOrder.id}` ? 'Accepting…' : 'Accept assignment'}
                  </button>
                )}
                {selectedOrder.status === 'dispatched' && (
                  <button
                    className="btn btn-gold"
                    onClick={() => void performOrderAction(`deliver:${selectedOrder.id}`, { action: 'mark_delivered', order_id: selectedOrder.id })}
                    disabled={actionKey === `deliver:${selectedOrder.id}`}
                  >
                    {actionKey === `deliver:${selectedOrder.id}` ? 'Updating…' : 'Mark delivered'}
                  </button>
                )}
                {selectedOrder.payment_method === 'cash' && selectedOrder.payment_status !== 'paid' && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => void performOrderAction(`cash:${selectedOrder.id}`, { action: 'mark_cash_collected', order_id: selectedOrder.id })}
                    disabled={actionKey === `cash:${selectedOrder.id}`}
                  >
                    {actionKey === `cash:${selectedOrder.id}` ? 'Saving…' : 'Mark cash collected'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="panel-empty">
              <p>Select an order to view the delivery details.</p>
              <span>Your next assignment will appear here.</span>
            </div>
          )}
        </div>
      </section>

      <section className="recent-section">
        <div className="section-heading">
          <h2>Recent history</h2>
          <span>{recentOrders.length}</span>
        </div>
        <div className="recent-grid">
          {recentOrders.map((order) => (
            <div key={order.id} className="recent-card">
              <div className="order-card-top">
                <span className="order-number mono">#{order.id.slice(0, 8).toUpperCase()}</span>
                <span className={`badge badge-${order.status}`}>{order.status}</span>
              </div>
              <p>{order.customer?.name ?? order.customer?.phone_e164 ?? 'Guest customer'}</p>
              <span className="recent-meta">{formatMoney(order.total)} · {order.payment_method}</span>
            </div>
          ))}
          {recentOrders.length === 0 && (
            <div className="recent-card empty">
              <p>No delivery history yet.</p>
            </div>
          )}
        </div>
      </section>
      <InAppAlertStack alerts={alerts} onDismiss={dismissAlert} />
    </div>
  )
}
