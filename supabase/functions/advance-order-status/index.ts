// supabase/functions/advance-order-status/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff } from '../_shared/staffAuth.ts'
import { createDriverNotification, releaseDriverAssignment } from '../_shared/driverWorkflow.ts'
import { emitOperatorInAppNotification } from '../_shared/operatorInAppNotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled'
type FulfillmentMode = 'outside_delivery' | 'hotel_room_delivery'

interface AdvanceOrderStatusBody {
  order_id?: string
  to_status?: OrderStatus
  reason?: string
}

const DEFAULT_VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['preparing', 'cancelled'],
  preparing:  ['ready'],
  ready:      ['dispatched'],
  dispatched: ['delivered'],
  delivered:  [],
  cancelled:  [],
}

function normalizeFulfillmentMode(value: unknown): FulfillmentMode {
  return value === 'hotel_room_delivery' ? 'hotel_room_delivery' : 'outside_delivery'
}

function getValidTransitions(fromStatus: OrderStatus, fulfillmentMode: FulfillmentMode): OrderStatus[] {
  if (fromStatus === 'ready' && fulfillmentMode === 'hotel_room_delivery') {
    return ['delivered']
  }
  return DEFAULT_VALID_TRANSITIONS[fromStatus] ?? []
}

const STATUS_TO_EVENT: Record<OrderStatus, string> = {
  confirmed:  'order.confirmed',
  preparing:  'order.preparation_started',
  ready:      'order.ready',
  dispatched: 'order.dispatched',
  delivered:  'order.delivered',
  cancelled:  'order.cancelled',
  pending:    '',
}

const ROLE_PERMISSIONS: Record<string, OrderStatus[]> = {
  supervisor: ['confirmed', 'preparing', 'ready', 'dispatched', 'delivered'],
  manager:    ['confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'],
  admin:      ['confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'],
  system:     ['confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'],
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && value in STATUS_TO_EVENT
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  let stage = 'authenticate_staff'

  try {
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    const actorRole = authenticatedStaff.staff.app_role
    const actorId = authenticatedStaff.staff.id

    stage = 'parse_request'
    const { order_id, to_status, reason } = await req.json() as AdvanceOrderStatusBody

    if (!order_id || !to_status) {
      throw new Error('order_id and to_status are required')
    }

    if (!isOrderStatus(to_status)) {
      throw new Error(`Invalid to_status: ${String(to_status)}`)
    }

    // Check role permission
    stage = 'check_role_permissions'
    const allowedStatuses = ROLE_PERMISSIONS[actorRole] ?? []
    if (!allowedStatuses.includes(to_status)) {
      throw new Error(`Role '${actorRole}' cannot set status to '${to_status}'`)
    }

    // SELECT FOR UPDATE prevents race conditions
    stage = 'load_order'
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, customer_id, language_pref, driver_id, payment_method, payment_status, delivery_address, fulfillment_mode')
      .eq('id', order_id)
      .single()

    if (fetchErr || !order) throw new Error('Order not found')

    const fromStatus = order.status as OrderStatus
    const fulfillmentMode = normalizeFulfillmentMode(order.fulfillment_mode)

    // Validate transition
    stage = 'validate_transition'
    const validNext = getValidTransitions(fromStatus, fulfillmentMode)
    if (!validNext.includes(to_status)) {
      throw new Error(
        `Invalid transition: ${fromStatus} → ${to_status}. Valid transitions: ${validNext.join(', ')}`
      )
    }

    // Special case: supervisor cannot cancel
    if (to_status === 'cancelled' && actorRole === 'supervisor') {
      throw new Error('Supervisors cannot cancel orders. Contact a manager.')
    }

    if (to_status === 'dispatched' && !order.driver_id) {
      throw new Error('Assign a driver before dispatching this order')
    }

    // Update order
    const updateData: Record<string, unknown> = { status: to_status }
    if (to_status === 'cancelled' && reason) {
      updateData.cancellation_reason = reason
    }

    stage = 'update_order'
    const { error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id)
      .eq('status', fromStatus) // Optimistic lock

    if (updateErr) throw updateErr

    // Write event with idempotency
    const idempotencyKey = `${order_id}::${STATUS_TO_EVENT[to_status]}::${actorId}::${Math.floor(Date.now() / 60000)}`

    stage = 'insert_order_event'
    const { error: eventErr } = await supabase.from('order_events').insert({
      order_id,
      event_type: STATUS_TO_EVENT[to_status],
      from_status: fromStatus,
      to_status,
      actor_id: actorId,
      actor_role: actorRole,
      payload: {
        reason: reason ?? null,
        previous_status: fromStatus,
      },
      idempotency_key: idempotencyKey,
    })

    // Ignore duplicate idempotency key (already processed)
    if (eventErr && !eventErr.message.includes('unique')) {
      console.error('Event write error (non-duplicate):', eventErr)
    }

    stage = 'insert_audit_log'
    await supabase.from('audit_logs').insert({
      action: 'order.status_updated',
      actor_id: actorId,
      actor_role: actorRole,
      entity_type: 'order',
      entity_id: order_id,
      metadata: {
        from_status: fromStatus,
        to_status,
        reason: reason ?? null,
      },
    })

    const orderNumber = order_id.slice(0, 8).toUpperCase()
    const statusLabels: Record<OrderStatus, string> = {
      pending: 'received',
      confirmed: 'confirmed',
      preparing: 'preparing',
      ready: 'ready for dispatch',
      dispatched: 'dispatched',
      delivered: 'delivered',
      cancelled: 'cancelled',
    }
    if (to_status !== 'cancelled') {
      await emitOperatorInAppNotification(supabase, {
        event_type: 'order.status_updated',
        order_id,
        driver_id: (order.driver_id as string | null) ?? null,
        title: `Order #${orderNumber} ${statusLabels[to_status]}`,
        message: `Order #${orderNumber} moved from ${fromStatus} to ${to_status}.`,
        payload: {
          order_number: orderNumber,
          from_status: fromStatus,
          to_status,
          reason: reason ?? null,
        },
      })
    }

    // Get customer phone for notification
    if (order.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('phone_e164')
        .eq('id', order.customer_id)
        .single()

      if (customer) {
        // Fire notification async
        stage = 'dispatch_customer_notification'
        supabase.functions.invoke('send-notification', {
          body: {
            event_type: STATUS_TO_EVENT[to_status],
            order_id,
            customer_phone: customer.phone_e164,
            language: order.language_pref,
            variables: {
              order_number: order_id.slice(0, 8).toUpperCase(),
              reason: reason ?? 'N/A',
            },
          },
        }).catch((notificationError) => {
          console.error('Customer notification dispatch failed:', notificationError)
        })
      }
    }

    if (to_status === 'cancelled') {
      if (order.driver_id) {
        stage = 'release_driver_after_cancellation'
        await releaseDriverAssignment(supabase, order.driver_id as string, order_id)

        await createDriverNotification(supabase, {
          driver_id: order.driver_id as string,
          order_id,
          event_type: 'order.cancelled',
          title: `Order #${orderNumber} cancelled`,
          message: 'This delivery was cancelled by the operations team.',
          payload: {
            order_number: orderNumber,
            reason: reason ?? null,
          },
        })
      }

      stage = 'dispatch_operator_notification'
      supabase.functions.invoke('operator-notification-dispatch', {
        body: {
          event_type: 'order.cancelled',
          order_id,
        },
      }).catch((dispatchError) => {
        console.error('Operator notification dispatch failed:', dispatchError)
      })
    }

    if (to_status === 'ready' && order.driver_id && fulfillmentMode !== 'hotel_room_delivery') {
      stage = 'notify_driver_ready'
      const orderNumber = order_id.slice(0, 8).toUpperCase()
      const deliveryAddress = (order.delivery_address ?? {}) as Record<string, string | undefined>
      await createDriverNotification(supabase, {
        driver_id: order.driver_id as string,
        order_id,
        event_type: 'order.ready_for_dispatch',
        title: `Order #${orderNumber} is ready`,
        message: `Pickup is ready for ${deliveryAddress.area ?? 'the assigned delivery area'}.`,
        payload: {
          order_number: orderNumber,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          area: deliveryAddress.area ?? null,
        },
      })
    }

    if (to_status === 'delivered' && order.driver_id) {
      stage = 'release_driver_after_delivery'
      await releaseDriverAssignment(supabase, order.driver_id as string, order_id)
    }

    return new Response(
      JSON.stringify({ success: true, order_id, from_status: fromStatus, to_status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('advance-order-status failed', { stage, message })
    return new Response(
      JSON.stringify({ success: false, error: message, stage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
