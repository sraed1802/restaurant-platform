import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  verifyQPayWebhookSignature,
} from '../_shared/integrations/qpay.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-qpay-signature, authorization, x-client-info, apikey',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-qpay-signature')

  try {
    const isValidSignature = await verifyQPayWebhookSignature(rawBody, signature)
    if (!isValidSignature) {
      console.error('QPay webhook signature validation failed')
      return new Response(
        JSON.stringify({ error: 'Invalid webhook signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = rawBody ? JSON.parse(rawBody) : {}
    const transactionId =
      payload.transaction_id || payload.id || payload.transactionId || null
    const referenceId =
      payload.reference_id || payload.order_reference || payload.referenceId || null
    const statusRaw = payload.status || payload.transaction_status || payload.state || ''
    const normalizedStatus = statusRaw.toString().trim().toLowerCase()

    if (!transactionId && !referenceId) {
      throw new Error('Webhook payload missing transaction_id and reference_id')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const paymentsQuery = transactionId && referenceId
      ? supabase.from('payments').select('*').or(
          `provider_transaction_id.eq.${transactionId},provider_payment_reference.eq.${referenceId}`
        )
      : transactionId
        ? supabase.from('payments').select('*').eq('provider_transaction_id', transactionId)
        : supabase.from('payments').select('*').eq('provider_payment_reference', referenceId)

    const { data: payment, error: paymentLookupError } = await paymentsQuery.single()
    if (paymentLookupError) {
      console.error('QPay webhook payment lookup failed:', paymentLookupError)
      return new Response(
        JSON.stringify({ error: 'Payment record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mappedStatus: 'pending' | 'captured' | 'failed' | 'refunded' | 'cancelled' =
      ['paid', 'capture', 'captured', 'success', 'approved', 'authorized'].includes(normalizedStatus)
        ? 'captured'
        : ['failed', 'declined', 'rejected', 'cancelled', 'canceled', 'error'].includes(normalizedStatus)
          ? 'failed'
          : ['refunded', 'refund'].includes(normalizedStatus)
            ? 'refunded'
            : payment.status || 'pending'

    const now = new Date().toISOString()

    const { error: updatePaymentError } = await supabase
      .from('payments')
      .update({
        status: mappedStatus,
        updated_at: now,
        captured_at: mappedStatus === 'captured' ? now : payment.captured_at,
        refunded_at: mappedStatus === 'refunded' ? now : payment.refunded_at,
        provider_response: payload,
      })
      .eq('id', payment.id)

    if (updatePaymentError) {
      console.error('QPay webhook failed to update payment row:', updatePaymentError)
      return new Response(
        JSON.stringify({ error: 'Failed to update payment record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orderPaymentStatus =
      mappedStatus === 'captured' ? 'paid' : mappedStatus === 'failed' ? 'failed' : mappedStatus === 'refunded' ? 'refunded' : undefined

    if (orderPaymentStatus) {
      const { error: updateOrderError } = await supabase
        .from('orders')
        .update({ payment_status: orderPaymentStatus })
        .eq('id', payment.order_id)

      if (updateOrderError) {
        console.error('QPay webhook failed to update order payment_status:', updateOrderError)
      }
    }

    const eventType =
      mappedStatus === 'captured'
        ? 'order.payment_confirmed'
        : mappedStatus === 'failed'
          ? 'order.payment_failed'
          : mappedStatus === 'refunded'
            ? 'order.payment_refunded'
            : null

    if (eventType) {
      await supabase.from('order_events').insert({
        order_id: payment.order_id,
        event_type: eventType,
        from_status: null,
        to_status: null,
        actor_id: null,
        actor_role: 'system',
        payload: {
          payment_status: mappedStatus,
          qpay_transaction_id: transactionId,
          qpay_reference_id: referenceId,
        },
        idempotency_key: `${payment.order_id}::${eventType}::${transactionId ?? referenceId}`,
      })

      await supabase.from('audit_logs').insert({
        action: eventType,
        actor_id: null,
        actor_role: 'system',
        entity_type: 'order',
        entity_id: payment.order_id,
        metadata: {
          payment_id: payment.id,
          provider: payment.payment_provider,
          provider_transaction_id: transactionId,
          provider_reference_id: referenceId,
          status: mappedStatus,
        },
      })
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('QPay webhook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown webhook failure'

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
