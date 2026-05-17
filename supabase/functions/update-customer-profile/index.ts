// supabase/functions/update-customer-profile/index.ts
// Triggered after order.delivered event to update customer stats + preference_vector
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { order_id } = await req.json()
    if (!order_id) throw new Error('order_id required')

    // Load delivered order with items
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(product_id, quantity, products(category_id))')
      .eq('id', order_id)
      .eq('status', 'delivered')
      .single()

    if (orderErr || !order) throw new Error('Order not found or not delivered')
    if (!order.customer_id) return new Response(JSON.stringify({ skipped: 'guest_order' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Load existing customer
    const { data: customer } = await supabase
      .from('customers')
      .select('total_orders, lifetime_value, preference_vector, first_order_at')
      .eq('id', order.customer_id)
      .single()

    if (!customer) throw new Error('Customer not found')

    // Build category affinity vector
    const affinity = (customer.preference_vector as Record<string, number> & { category_affinity?: Record<string, number> })?.category_affinity ?? {}
    for (const item of order.order_items ?? []) {
      const catId = (item.products as { category_id?: string } | null)?.category_id
      if (catId) {
        affinity[catId] = ((affinity[catId] ?? 0) + item.quantity) * 0.9 // Decay factor
      }
    }

    // Normalize affinity scores to 0-1
    const maxAffinity = Math.max(...Object.values(affinity), 1)
    const normalizedAffinity: Record<string, number> = {}
    for (const [k, v] of Object.entries(affinity)) {
      normalizedAffinity[k] = Math.round((v / maxAffinity) * 1000) / 1000
    }

    const newPreferenceVector = {
      ...(customer.preference_vector as Record<string, unknown> ?? {}),
      category_affinity: normalizedAffinity,
      avg_order_value: ((customer.lifetime_value + order.total) / (customer.total_orders + 1)),
      last_payment_method: order.payment_method,
      promo_user: !!order.promotion_id,
    }

    // Update customer atomically
    await supabase
      .from('customers')
      .update({
        total_orders: customer.total_orders + 1,
        lifetime_value: customer.lifetime_value + order.total,
        last_order_at: new Date().toISOString(),
        first_order_at: customer.first_order_at ?? new Date().toISOString(),
        preference_vector: newPreferenceVector,
      })
      .eq('id', order.customer_id)

    return new Response(
      JSON.stringify({ success: true, customer_id: order.customer_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
