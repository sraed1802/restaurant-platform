import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  constructStripeWebhookEvent,
  mapStripeEventToPaymentStatus,
} from '../_shared/integrations/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature, authorization, x-client-info, apikey',
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
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
  const signature = req.headers.get('stripe-signature')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let webhookEventId: string | null = null

  try {
    const event = await constructStripeWebhookEvent(rawBody, signature)
    webhookEventId = event.id
    const eventType = event.type
    const mappedStatus = mapStripeEventToPaymentStatus(eventType)
    const object = event.data.object as Record<string, unknown>

    const checkoutSessionId =
      object.object === 'checkout.session'
        ? getString(object.id)
        : getString(object.checkout_session)

    const paymentIntentId =
      object.object === 'payment_intent'
        ? getString(object.id)
        : getString(object.payment_intent)

    const orderIdFromMetadata =
      object.metadata && typeof object.metadata === 'object'
        ? getString((object.metadata as Record<string, unknown>).order_id)
        : null

    if (orderIdFromMetadata) {
      const { error: webhookInsertError } = await supabase
        .from('payment_webhook_events')
        .upsert({
          provider: 'stripe',
          event_id: event.id,
          event_type: event.type,
          livemode: event.livemode,
          order_id: orderIdFromMetadata,
          payload: event,
        }, {
          onConflict: 'provider,event_id',
        })

      if (webhookInsertError) {
        console.error('Stripe webhook event upsert failed:', webhookInsertError)
      }
    }

    const paymentsQuery = checkoutSessionId && paymentIntentId
      ? supabase
          .from('payments')
          .select('*')
          .or(`stripe_checkout_session_id.eq.${checkoutSessionId},stripe_payment_intent_id.eq.${paymentIntentId}`)
      : checkoutSessionId
        ? supabase.from('payments').select('*').eq('stripe_checkout_session_id', checkoutSessionId)
        : paymentIntentId
          ? supabase.from('payments').select('*').eq('stripe_payment_intent_id', paymentIntentId)
          : orderIdFromMetadata
            ? supabase.from('payments').select('*').eq('order_id', orderIdFromMetadata)
            : null

    if (!paymentsQuery) {
      throw new Error('Stripe webhook payload missing checkout session, payment intent, and order metadata')
    }

    const { data: payment, error: paymentLookupError } = await paymentsQuery.single()
    if (paymentLookupError || !payment) {
      throw paymentLookupError ?? new Error('Payment record not found')
    }

    const now = new Date().toISOString()
    const providerResponse = {
      event_type: event.type,
      event_id: event.id,
      payload: event.data.object,
    }

    const { error: paymentUpdateError } = await supabase
      .from('payments')
      .update({
        status: mappedStatus,
        updated_at: now,
        webhook_event_id: event.id,
        provider_response: providerResponse,
        stripe_checkout_session_id: checkoutSessionId ?? payment.stripe_checkout_session_id,
        stripe_payment_intent_id: paymentIntentId ?? payment.stripe_payment_intent_id,
        captured_at: mappedStatus === 'captured' ? now : payment.captured_at,
        refunded_at: mappedStatus === 'refunded' ? now : payment.refunded_at,
      })
      .eq('id', payment.id)

    if (paymentUpdateError) {
      throw paymentUpdateError
    }

    const orderPaymentStatus =
      mappedStatus === 'captured'
        ? 'paid'
        : mappedStatus === 'failed'
          ? 'failed'
          : mappedStatus === 'refunded'
            ? 'refunded'
            : undefined

    if (orderPaymentStatus) {
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({ payment_status: orderPaymentStatus })
        .eq('id', payment.order_id)

      if (orderUpdateError) {
        console.error('Stripe webhook failed to update order payment_status:', orderUpdateError)
      }
    }

    const orderEventType =
      mappedStatus === 'captured'
        ? 'order.payment_confirmed'
        : mappedStatus === 'failed'
          ? 'order.payment_failed'
          : mappedStatus === 'refunded'
            ? 'order.payment_refunded'
            : mappedStatus === 'cancelled'
              ? 'order.payment_cancelled'
              : null

    if (orderEventType) {
      await supabase.from('order_events').insert({
        order_id: payment.order_id,
        event_type: orderEventType,
        from_status: null,
        to_status: null,
        actor_id: null,
        actor_role: 'system',
        payload: {
          payment_status: mappedStatus,
          provider: 'stripe',
          checkout_session_id: checkoutSessionId,
          payment_intent_id: paymentIntentId,
        },
        idempotency_key: `${payment.order_id}::${orderEventType}::${event.id}`,
      })

      await supabase.from('audit_logs').insert({
        action: orderEventType,
        actor_id: null,
        actor_role: 'system',
        entity_type: 'order',
        entity_id: payment.order_id,
        metadata: {
          payment_id: payment.id,
          provider: 'stripe',
          checkout_session_id: checkoutSessionId,
          payment_intent_id: paymentIntentId,
          status: mappedStatus,
        },
      })
    }

    const { error: webhookProcessedError } = await supabase
      .from('payment_webhook_events')
      .upsert({
        provider: 'stripe',
        event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payment_id: payment.id,
        order_id: payment.order_id,
        payload: event,
        processed_at: now,
        processing_error: null,
        updated_at: now,
      }, {
        onConflict: 'provider,event_id',
      })

    if (webhookProcessedError) {
      console.error('Stripe webhook failed to mark webhook event as processed:', webhookProcessedError)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Stripe webhook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown webhook failure'

    if (webhookEventId) {
      await supabase
        .from('payment_webhook_events')
        .update({
          processing_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('provider', 'stripe')
        .eq('event_id', webhookEventId)
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
