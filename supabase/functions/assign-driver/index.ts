// supabase/functions/assign-driver/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff } from '../_shared/staffAuth.ts'
import { createDriverNotification } from '../_shared/driverWorkflow.ts'
import { emitOperatorInAppNotification } from '../_shared/operatorInAppNotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    stage = 'authenticate_staff'
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    const actorId = authenticatedStaff.staff.id
    const actorRole = authenticatedStaff.staff.app_role

    stage = 'parse_request'
    const { order_id, driver_id } = await req.json()
    if (!order_id || !driver_id) throw new Error('order_id and driver_id required')

    // Validate order is in 'ready' state
    stage = 'load_order'
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, driver_id, payment_method, payment_status, delivery_address, fulfillment_mode')
      .eq('id', order_id)
      .single()

    if (orderErr || !order) throw new Error('Order not found')
    if (order.fulfillment_mode === 'hotel_room_delivery') {
      throw new Error('Hotel room delivery orders do not require driver assignment')
    }
    if (!['ready', 'confirmed', 'preparing'].includes(order.status)) {
      throw new Error(`Cannot assign driver to order in status: ${order.status}`)
    }
    if (order.driver_id) throw new Error('Order already has a driver assigned')

    // Validate driver is available
    stage = 'load_driver'
    const { data: driver, error: driverErr } = await supabase
      .from('drivers')
      .select('id, status, name, phone_e164, active_order_id, organization_id, cluster_id, property_id')
      .eq('id', driver_id)
      .eq('is_active', true)
      .single()

    if (driverErr || !driver) throw new Error('Driver not found')
    if (driver.active_order_id) {
      throw new Error('Driver already has an active order')
    }
    if (driver.status !== 'available') {
      throw new Error(`Driver is not available (status: ${driver.status})`)
    }

    // Update the order first, then claim the driver. If the driver claim fails, roll the order back.
    stage = 'update_order_and_driver'
    const { data: claimedOrders, error: orderUpdateError } = await supabase
      .from('orders')
      .update({ driver_id })
      .eq('id', order_id)
      .is('driver_id', null)
      .select('id')

    if (orderUpdateError) throw orderUpdateError
    if (!claimedOrders || claimedOrders.length === 0) {
      throw new Error('Order already has a driver assigned')
    }

    const { data: claimedDrivers, error: driverUpdateError } = await supabase
      .from('drivers')
      .update({ status: 'busy', active_order_id: order_id })
      .eq('id', driver_id)
      .eq('status', 'available')
      .is('active_order_id', null)
      .select('id')

    if (driverUpdateError || !claimedDrivers || claimedDrivers.length === 0) {
      stage = 'rollback_order_assignment'
      const { error: rollbackError } = await supabase
        .from('orders')
        .update({ driver_id: null })
        .eq('id', order_id)
        .eq('driver_id', driver_id)

      if (rollbackError) {
        throw new Error('Driver could not be claimed and order rollback failed')
      }

      throw new Error('Driver is no longer available')
    }

    // Log event
    stage = 'insert_order_event'
    await supabase.from('order_events').insert({
      order_id,
      event_type: 'order.driver_assigned',
      actor_id: actorId,
      actor_role: actorRole,
      payload: {
        driver_id,
        driver_name: driver.name,
        driver_phone: driver.phone_e164,
      },
      idempotency_key: `${order_id}::driver_assigned::${driver_id}::${Math.floor(Date.now() / 60000)}`,
    })

    stage = 'insert_audit_log'
    await supabase.from('audit_logs').insert({
      action: 'order.driver_assigned',
      actor_id: actorId,
      actor_role: actorRole,
      entity_type: 'order',
      entity_id: order_id,
      metadata: {
        driver_id,
        driver_name: driver.name,
      },
    })

    const deliveryAddress = (order.delivery_address ?? {}) as Record<string, string | undefined>
    const orderNumber = order_id.slice(0, 8).toUpperCase()
    const cashToCollect = order.payment_method === 'cash' && order.payment_status !== 'paid'

    await emitOperatorInAppNotification(supabase, {
      event_type: 'order.status_updated',
      order_id,
      driver_id,
      title: `Driver assigned #${orderNumber}`,
      message: `${driver.name} was assigned to order #${orderNumber}.`,
      payload: { order_number: orderNumber, driver_id, driver_name: driver.name },
    })

    stage = 'create_driver_notification'
    await createDriverNotification(supabase, {
      driver_id,
      order_id,
      event_type: 'order.assigned',
      title: `New delivery #${orderNumber}`,
      message: cashToCollect
        ? `Assigned delivery to ${deliveryAddress.area ?? 'customer area'} with cash collection required.`
        : `Assigned delivery to ${deliveryAddress.area ?? 'customer area'}.`,
      payload: {
        order_number: orderNumber,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        cash_to_collect: cashToCollect,
        area: deliveryAddress.area ?? null,
        street: deliveryAddress.street ?? null,
        building: deliveryAddress.building ?? null,
      },
      organization_id: (driver.organization_id as string | null) ?? null,
      cluster_id: (driver.cluster_id as string | null) ?? null,
      property_id: (driver.property_id as string | null) ?? null,
    })

    return new Response(
      JSON.stringify({ success: true, driver_name: driver.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('assign-driver failed', { stage, message })
    return new Response(
      JSON.stringify({ success: false, error: message, stage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
