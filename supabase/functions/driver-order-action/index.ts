import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveDriver } from '../_shared/driverAuth.ts'
import { acknowledgeDriverNotifications, releaseDriverAssignment } from '../_shared/driverWorkflow.ts'
import { driverStatusLabel, emitOperatorInAppNotification } from '../_shared/operatorInAppNotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type DriverAction =
  | 'accept_assignment'
  | 'mark_delivered'
  | 'mark_cash_collected'
  | 'set_driver_status'

type DriverStatus = 'offline' | 'available' | 'busy' | 'break'

interface DriverActionBody {
  action?: DriverAction
  order_id?: string
  status?: DriverStatus
}

function normalizeDriverStatus(value: unknown): DriverStatus {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'offline' || status === 'available' || status === 'busy' || status === 'break') {
    return status
  }

  throw new Error('Invalid driver status')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  let stage = 'authenticate_driver'

  try {
    const authenticatedDriver = await requireActiveDriver(req, supabase)
    const driver = authenticatedDriver.driver
    const body = await req.json() as DriverActionBody
    const action = body.action

    if (!action) {
      throw new Error('action is required')
    }

    if (action === 'set_driver_status') {
      stage = 'set_driver_status'
      const nextStatus = normalizeDriverStatus(body.status)

      if (driver.active_order_id && nextStatus !== 'busy') {
        throw new Error('Complete or reassign the active order before leaving busy status')
      }
      if (!driver.active_order_id && nextStatus === 'busy') {
        throw new Error('Busy status is reserved for an active delivery')
      }

      const { data: updatedDriver, error: updateDriverError } = await supabase
        .from('drivers')
        .update({
          status: nextStatus,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', driver.id)
        .select('id, auth_user_id, name, phone_e164, status, active_order_id, is_active, login_email')
        .single()

      if (updateDriverError || !updatedDriver) {
        throw updateDriverError ?? new Error('Failed to update driver status')
      }

      return new Response(JSON.stringify({ success: true, data: { driver: updatedDriver } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const orderId = String(body.order_id ?? '').trim()
    if (!orderId) {
      throw new Error('order_id is required')
    }

    stage = 'load_order'
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, driver_id, payment_method, payment_status, total')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw orderError ?? new Error('Order not found')
    }
    if (order.driver_id !== driver.id) {
      throw new Error('Forbidden')
    }

    if (action === 'accept_assignment') {
      stage = 'accept_assignment'

      const { error: updateDriverError } = await supabase
        .from('drivers')
        .update({
          status: 'busy',
          active_order_id: orderId,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', driver.id)

      if (updateDriverError) throw updateDriverError

      await acknowledgeDriverNotifications(supabase, driver.id, orderId)

      await supabase.from('order_events').insert({
        order_id: orderId,
        event_type: 'order.driver_assignment_accepted',
        from_status: order.status,
        to_status: order.status,
        actor_id: driver.id,
        actor_role: 'driver',
        payload: {
          driver_id: driver.id,
          driver_name: driver.name,
        },
        idempotency_key: `${orderId}::driver_assignment_accepted::${driver.id}::${Math.floor(Date.now() / 60000)}`,
      })

      await supabase.from('audit_logs').insert({
        action: 'driver.assignment_accepted',
        actor_id: driver.id,
        actor_role: 'driver',
        entity_type: 'order',
        entity_id: orderId,
        metadata: {
          driver_id: driver.id,
        },
      })

      const orderNumber = orderId.slice(0, 8).toUpperCase()
      await emitOperatorInAppNotification(supabase, {
        event_type: 'driver.assignment_accepted',
        order_id: orderId,
        driver_id: driver.id,
        title: `Driver accepted #${orderNumber}`,
        message: `${driver.name} accepted the delivery assignment.`,
        payload: { order_number: orderNumber, driver_id: driver.id, driver_name: driver.name },
      })

      return new Response(JSON.stringify({ success: true, data: { order_id: orderId } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'mark_delivered') {
      stage = 'mark_delivered'
      if (order.status !== 'dispatched') {
        throw new Error('Only dispatched orders can be marked as delivered')
      }

      const { error: updateOrderError } = await supabase
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', orderId)
        .eq('status', 'dispatched')

      if (updateOrderError) throw updateOrderError

      await supabase.from('order_events').insert({
        order_id: orderId,
        event_type: 'order.delivered',
        from_status: 'dispatched',
        to_status: 'delivered',
        actor_id: driver.id,
        actor_role: 'driver',
        payload: {
          delivered_by_driver_id: driver.id,
          driver_name: driver.name,
        },
        idempotency_key: `${orderId}::order.delivered::driver::${driver.id}::${Math.floor(Date.now() / 60000)}`,
      })

      await supabase.from('audit_logs').insert({
        action: 'order.delivered',
        actor_id: driver.id,
        actor_role: 'driver',
        entity_type: 'order',
        entity_id: orderId,
        metadata: {
          driver_id: driver.id,
        },
      })

      await releaseDriverAssignment(supabase, driver.id, orderId)
      await acknowledgeDriverNotifications(supabase, driver.id, orderId)

      const deliveredOrderNumber = orderId.slice(0, 8).toUpperCase()
      await emitOperatorInAppNotification(supabase, {
        event_type: 'driver.delivered',
        order_id: orderId,
        driver_id: driver.id,
        title: `Delivery completed #${deliveredOrderNumber}`,
        message: `${driver.name} marked order #${deliveredOrderNumber} as delivered.`,
        payload: { order_number: deliveredOrderNumber, driver_id: driver.id, driver_name: driver.name },
      })

      return new Response(JSON.stringify({ success: true, data: { order_id: orderId, status: 'delivered' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'mark_cash_collected') {
      stage = 'mark_cash_collected'
      if (order.payment_method !== 'cash') {
        throw new Error('Only cash orders can be marked as collected')
      }
      if (order.payment_status === 'paid') {
        throw new Error('Cash payment is already marked as collected')
      }

      const { error: updatePaymentError } = await supabase
        .from('orders')
        .update({ payment_status: 'paid' })
        .eq('id', orderId)
        .eq('payment_status', order.payment_status)

      if (updatePaymentError) throw updatePaymentError

      await supabase.from('order_events').insert({
        order_id: orderId,
        event_type: 'order.payment_status_updated',
        from_status: order.status,
        to_status: order.status,
        actor_id: driver.id,
        actor_role: 'driver',
        payload: {
          payment_method: order.payment_method,
          from_payment_status: order.payment_status,
          to_payment_status: 'paid',
          total: order.total,
        },
        idempotency_key: `${orderId}::order.payment_status_updated::driver::${driver.id}::${Math.floor(Date.now() / 60000)}`,
      })

      await supabase.from('audit_logs').insert({
        action: 'order.payment_status_updated',
        actor_id: driver.id,
        actor_role: 'driver',
        entity_type: 'order',
        entity_id: orderId,
        metadata: {
          payment_method: order.payment_method,
          from_payment_status: order.payment_status,
          to_payment_status: 'paid',
        },
      })

      const cashOrderNumber = orderId.slice(0, 8).toUpperCase()
      await emitOperatorInAppNotification(supabase, {
        event_type: 'driver.cash_collected',
        order_id: orderId,
        driver_id: driver.id,
        title: `Cash collected #${cashOrderNumber}`,
        message: `${driver.name} collected QAR ${Number(order.total ?? 0).toFixed(2)} for order #${cashOrderNumber}.`,
        payload: {
          order_number: cashOrderNumber,
          driver_id: driver.id,
          driver_name: driver.name,
          total: order.total,
        },
      })

      return new Response(JSON.stringify({ success: true, data: { order_id: orderId, payment_status: 'paid' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unsupported action')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('driver-order-action failed', { stage, message })
    return new Response(JSON.stringify({ success: false, error: message, stage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
