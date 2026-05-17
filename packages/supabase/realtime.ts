// packages/supabase/realtime.ts
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { OrderEvent, OrderStatus } from './types'

type ChannelRegistry = Map<string, RealtimeChannel>
const registry: ChannelRegistry = new Map()

export function getOrCreateChannel(
  name: string,
  client: SupabaseClient
): RealtimeChannel {
  if (!registry.has(name)) {
    registry.set(name, client.channel(name))
  }
  return registry.get(name)!
}

export function destroyChannel(name: string): void {
  const ch = registry.get(name)
  if (ch) {
    ch.unsubscribe()
    registry.delete(name)
  }
}

export function destroyAllChannels(): void {
  registry.forEach((ch) => ch.unsubscribe())
  registry.clear()
}

// ─── Channel name constants ────────────────────────────────
export const CHANNELS = {
  adminOrders: 'admin:orders',
  adminDrivers: 'admin:drivers',
  adminAlerts: 'admin:alerts',
  orderTracking: (orderId: string) => `order:${orderId}`,
}

// ─── Event type constants ──────────────────────────────────
export const ORDER_EVENTS = {
  CREATED: 'order.created',
  CONFIRMED: 'order.confirmed',
  PREPARATION_STARTED: 'order.preparation_started',
  READY: 'order.ready',
  DRIVER_ASSIGNED: 'order.driver_assigned',
  DISPATCHED: 'order.dispatched',
  DELIVERED: 'order.delivered',
  CANCELLED: 'order.cancelled',
  FORCE_CANCELLED: 'order.force_cancelled',
} as const

export const CUSTOMER_EVENTS = {
  SESSION_STARTED: 'session.started',
  MENU_VIEWED: 'menu.viewed',
  PRODUCT_VIEWED: 'product.viewed',
  CART_ITEM_ADDED: 'cart.item_added',
  CART_ITEM_REMOVED: 'cart.item_removed',
  CART_ABANDONED: 'cart.abandoned',
  CHECKOUT_STARTED: 'checkout.started',
  OTP_SENT: 'checkout.otp_sent',
  OTP_VERIFIED: 'checkout.otp_verified',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
} as const

// ─── Valid state machine transitions ──────────────────────
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['preparing', 'cancelled'],
  preparing:  ['ready'],
  ready:      ['dispatched'],
  dispatched: ['delivered'],
  delivered:  [],
  cancelled:  [],
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Analytics event emitter ──────────────────────────────
let sessionId: string | null = null

export function getSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID()
  }
  return sessionId
}

export async function trackEvent(
  client: SupabaseClient,
  eventType: string,
  properties: Record<string, unknown> = {},
  entityId?: string,
  entityType?: string
): Promise<void> {
  try {
    await client.from('analytics_events').insert({
      event_type: eventType,
      session_id: getSessionId(),
      entity_id: entityId,
      entity_type: entityType,
      properties,
      partition_date: new Date().toISOString().split('T')[0],
    })
  } catch {
    // Silently fail - analytics should never block the user
    console.warn('[Analytics] Failed to track event:', eventType)
  }
}

// ─── Idempotency key generator ────────────────────────────
export function makeIdempotencyKey(
  orderId: string,
  eventType: string,
  actorId: string
): string {
  const epochMinute = Math.floor(Date.now() / 60000)
  return `${orderId}::${eventType}::${actorId}::${epochMinute}`
}
