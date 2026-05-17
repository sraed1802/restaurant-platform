// supabase/functions/claim-order-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
 
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
 
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
 
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
 
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized')
 
    const jwt = authHeader.slice(7).trim()
    const { data: userData, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !userData.user) throw new Error('Unauthorized')
 
    const authEmail = userData.user.email
    if (!authEmail) throw new Error('Email missing on authenticated user')
 
    const { order_id } = await req.json()
    if (!order_id) throw new Error('order_id is required')
 
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, customer_id, status')
      .eq('id', order_id)
      .single()
    if (orderErr || !order) throw new Error('Order not found')
    if (!order.customer_id) throw new Error('Order has no customer_id')
 
    const { data: updatedCustomer, error: custErr } = await supabase
      .from('customers')
      .update({ email: authEmail })
      .eq('id', order.customer_id)
      .select('id, email')
      .single()
    if (custErr) throw custErr
 
    // Best-effort event for traceability
    await supabase.from('order_events').insert({
      order_id: order.id,
      event_type: 'order.customer_email_verified',
      from_status: order.status,
      to_status: order.status,
      actor_role: 'customer',
      actor_id: order.customer_id,
      payload: { email: authEmail },
      idempotency_key: `${order.id}::order.customer_email_verified::${order.customer_id}::${authEmail}`,
    })
 
    return new Response(JSON.stringify({ success: true, customer: updatedCustomer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

