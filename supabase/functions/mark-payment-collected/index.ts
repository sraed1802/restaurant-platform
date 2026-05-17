// supabase/functions/mark-payment-collected/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff } from '../_shared/staffAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    const staffRow = authenticatedStaff.staff

    const { order_id, payment_status } = await req.json()
    if (!order_id) throw new Error('order_id is required')

    const nextStatus: PaymentStatus = (payment_status ?? 'paid') as PaymentStatus
    if (!['pending', 'paid', 'failed', 'refunded'].includes(nextStatus)) {
      throw new Error('Invalid payment_status')
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, payment_method, payment_status, status, customer_id, total')
      .eq('id', order_id)
      .single()
    if (orderErr) throw orderErr

    // Only meaningful to tag cash/collect-on-delivery, but allow explicit overrides by staff.
    const { error: updErr } = await supabase
      .from('orders')
      .update({ payment_status: nextStatus })
      .eq('id', order_id)
      .eq('payment_status', order.payment_status) // optimistic lock
    if (updErr) throw updErr

    await supabase.from('order_events').insert({
      order_id,
      event_type: 'order.payment_status_updated',
      from_status: order.status,
      to_status: order.status,
      actor_role: staffRow.app_role,
      actor_id: staffRow.id,
      payload: {
        payment_method: order.payment_method,
        from_payment_status: order.payment_status,
        to_payment_status: nextStatus,
        total: order.total,
      },
      idempotency_key: `${order_id}::order.payment_status_updated::${staffRow.id}::${order.payment_status}::${nextStatus}::${Math.floor(Date.now() / 60000)}`,
    })

    await supabase.from('audit_logs').insert({
      action: 'order.payment_status_updated',
      actor_id: staffRow.id,
      actor_role: staffRow.app_role,
      entity_type: 'order',
      entity_id: order_id,
      metadata: {
        payment_method: order.payment_method,
        from_payment_status: order.payment_status,
        to_payment_status: nextStatus,
      },
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

