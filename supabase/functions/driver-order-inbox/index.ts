import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveDriver } from '../_shared/driverAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const driverId = authenticatedDriver.driver.id

    stage = 'load_active_orders'
    const { data: activeOrders, error: activeOrdersError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        payment_method,
        payment_status,
        total,
        created_at,
        confirmed_at,
        ready_at,
        dispatched_at,
        delivered_at,
        special_instructions,
        delivery_address,
        customer:customers(name, phone_e164, email),
        order_items(id, quantity, total_price, product_snapshot)
      `)
      .eq('driver_id', driverId)
      .in('status', ['confirmed', 'preparing', 'ready', 'dispatched'])
      .order('created_at', { ascending: false })

    if (activeOrdersError) throw activeOrdersError

    stage = 'load_recent_orders'
    const { data: recentOrders, error: recentOrdersError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        payment_method,
        payment_status,
        total,
        created_at,
        delivered_at,
        cancelled_at,
        delivery_address,
        customer:customers(name, phone_e164, email)
      `)
      .eq('driver_id', driverId)
      .in('status', ['delivered', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(12)

    if (recentOrdersError) throw recentOrdersError

    stage = 'load_notifications'
    const { data: notifications, error: notificationsError } = await supabase
      .from('driver_notifications')
      .select('id, order_id, event_type, title, message, payload, acknowledged_at, created_at')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (notificationsError) throw notificationsError

    return new Response(JSON.stringify({
      success: true,
      data: {
        driver: authenticatedDriver.driver,
        active_orders: activeOrders ?? [],
        recent_orders: recentOrders ?? [],
        notifications: notifications ?? [],
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('driver-order-inbox failed', { stage, message })
    return new Response(JSON.stringify({ success: false, error: message, stage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
