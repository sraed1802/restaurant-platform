// supabase/functions/place-order/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { evaluateComboPricing } from '../_shared/comboPricing.ts'
import {
  coerceOrderAvailabilityScope,
  evaluateOrderAvailability,
  loadOrderAvailabilitySettings,
} from '../_shared/orderAvailability.ts'
import { loadPaymentGatewaySettings } from '../_shared/paymentGatewaySettings.ts'
import { hasCustomerPlacedOrder } from '../_shared/promotionEligibility.ts'
import { initiateQPayPayment } from '../_shared/integrations/qpay.ts'
import { initiateStripeCheckoutSession } from '../_shared/integrations/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type FulfillmentMode = 'outside_delivery' | 'hotel_room_delivery'

interface OutsideDeliveryAddress {
  mode?: 'outside_delivery'
  street: string
  building: string
  floor?: string
  apartment?: string
  area: string
  city: string
  coordinates?: { lat: number; lng: number }
  instructions?: string
}

interface HotelRoomDeliveryAddress {
  mode: 'hotel_room_delivery'
  guest_name: string
  room_number: string
  hotel_name?: string
  tower?: string
  area?: string
  city?: string
  instructions?: string
}

interface PlaceOrderPayload {
  customer_id?: string
  phone_e164: string
  customer_name?: string
  fulfillment_mode?: FulfillmentMode
  delivery_address: OutsideDeliveryAddress | HotelRoomDeliveryAddress
  items: Array<{
    product_id: string
    quantity: number
    selected_modifier_option_ids: string[]
    notes?: string
  }>
  promo_code?: string
  payment_method: 'cash' | 'card' | 'online'
  special_instructions?: string
  language_pref: 'en' | 'ar'
  tenant_scope?: {
    organization_id?: string | null
    cluster_id?: string | null
    property_id?: string | null
  }
}

interface ProductRow {
  id: string
  name_en: string
  name_ar: string
  base_price: number
  is_available: boolean
  prep_time_minutes: number
}

interface ModifierOptionRow {
  id: string
  name_en: string
  name_ar: string
  price_delta: number
  is_available: boolean
}

interface PromotionRow {
  id: string
  discount_type: 'fixed' | 'percentage' | 'free_delivery'
  discount_value: number
  min_order_value: number
  max_discount_cap: number | null
  usage_count: number
  condition_type: 'none' | 'first_order' | 'min_order' | 'specific_products' | 'specific_categories'
}

type ComboItemRole = 'main' | 'side' | 'drink' | 'dessert' | 'optional_drink'

interface ComboPromotionRow {
  id: string
  name_en: string
  name_ar: string
  promo_price: number
  original_price: number
  is_active: boolean
  items: Array<{
    product_id: string
    quantity: number
    item_role: ComboItemRole
    display_order: number
  }> | null
}

interface CustomerRow {
  id: string
  email: string | null
  name: string | null
}

function normalizeFulfillmentMode(value: unknown): FulfillmentMode {
  return value === 'hotel_room_delivery' ? 'hotel_room_delivery' : 'outside_delivery'
}

function isHotelRoomAddress(address: PlaceOrderPayload['delivery_address']): address is HotelRoomDeliveryAddress {
  return normalizeFulfillmentMode((address as { mode?: unknown })?.mode) === 'hotel_room_delivery'
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const payload: PlaceOrderPayload = await req.json()
    const fulfillmentMode = normalizeFulfillmentMode(
      payload.fulfillment_mode ?? (payload.delivery_address as { mode?: unknown } | undefined)?.mode
    )

    const authHeader = req.headers.get('Authorization')
    let authUserId: string | null = null
    let authEmail: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7).trim()
      const { data: userData, error: authErr } = await supabase.auth.getUser(jwt)
      if (!authErr && userData.user) {
        authUserId = userData.user.id
        authEmail = userData.user.email ?? null
      }
    }

    // Validate required fields
    if (!payload.phone_e164) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payload.items || payload.items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Order must contain at least one item' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payload.delivery_address) {
      return new Response(
        JSON.stringify({ error: 'Delivery address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (fulfillmentMode === 'hotel_room_delivery') {
      if (!isHotelRoomAddress(payload.delivery_address)) {
        return new Response(
          JSON.stringify({ error: 'Hotel room delivery requires guest_name and room_number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!payload.delivery_address.guest_name?.trim() || !payload.delivery_address.room_number?.trim()) {
        return new Response(
          JSON.stringify({ error: 'Guest name and room number are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else if (
      !payload.delivery_address.street?.trim()
      || !payload.delivery_address.area?.trim()
      || !payload.delivery_address.building?.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'Street, building, and area are required for outside delivery' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payload.payment_method) {
      return new Response(
        JSON.stringify({ error: 'Payment method is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tenantScope = coerceOrderAvailabilityScope(payload.tenant_scope)
    const orderAvailabilitySettings = await loadOrderAvailabilitySettings(supabase, tenantScope)
    const orderAvailabilityStatus = evaluateOrderAvailability(orderAvailabilitySettings)

    if (!orderAvailabilityStatus.is_open_now) {
      const publicMessage = payload.language_pref === 'ar'
        ? (orderAvailabilityStatus.public_message_ar ?? 'الطلبات مغلقة حالياً.')
        : (orderAvailabilityStatus.public_message_en ?? 'Orders are currently closed.')

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Orders are currently closed',
          reason: orderAvailabilityStatus.reason,
          next_open_at: orderAvailabilityStatus.next_open_at,
          public_message: publicMessage,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (payload.payment_method === 'online') {
      const paymentGatewaySettings = await loadPaymentGatewaySettings(supabase)
      if (!paymentGatewaySettings.stripe_enabled) {
        return new Response(
          JSON.stringify({ error: 'Online payments are currently unavailable' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── 1. Load and validate products ──────────────────────
    const productIds = payload.items.map((i) => i.product_id)
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name_en, name_ar, base_price, is_available, prep_time_minutes')
      .in('id', productIds)

    if (prodErr) throw prodErr

    const typedProducts = (products ?? []) as ProductRow[]
    const productMap = new Map(typedProducts.map((product) => [product.id, product]))
    for (const item of payload.items) {
      const p = productMap.get(item.product_id)
      if (!p) throw new Error(`Product not found: ${item.product_id}`)
      if (!p.is_available) throw new Error(`Product unavailable: ${p.name_en}`)
    }

    // ── 2. Load modifier options ────────────────────────────
    const allModifierIds = payload.items.flatMap((i) => i.selected_modifier_option_ids)
    const { data: modifiers } = await supabase
      .from('modifier_options')
      .select('id, name_en, name_ar, price_delta, is_available')
      .in('id', allModifierIds)

    const typedModifiers = (modifiers ?? []) as ModifierOptionRow[]
    const modifierMap = new Map(typedModifiers.map((modifier) => [modifier.id, modifier]))

    // ── 3. Validate and apply promotion ────────────────────
    let promotion: PromotionRow | null = null
    let promotionDiscount = 0

    if (payload.promo_code) {
      const nowIsoForPromo = new Date().toISOString()
      const { data: promo } = await supabase
        .from('promotions')
        .select('*')
        .eq('code', payload.promo_code.toUpperCase())
        .eq('is_active', true)
        .or(`valid_until.is.null,valid_until.gt.${nowIsoForPromo}`)
        .maybeSingle()

      const typedPromotion = promo as PromotionRow | null
      if (typedPromotion) {
        if (typedPromotion.condition_type === 'first_order') {
          const hasPlacedOrder = await hasCustomerPlacedOrder(supabase, {
            authUserId,
            phoneE164: payload.phone_e164,
          })

          if (hasPlacedOrder) {
            throw new Error('This welcome promotion is only available on your first order')
          }
        }

        promotion = typedPromotion
        // Calculate subtotal first for validation
        const rawSubtotal = payload.items.reduce((sum, item) => {
          const product = productMap.get(item.product_id)!
          const modTotal = item.selected_modifier_option_ids.reduce((ms, id) => {
            return ms + (modifierMap.get(id)?.price_delta ?? 0)
          }, 0)
          return sum + (product.base_price + modTotal) * item.quantity
        }, 0)

        if (rawSubtotal >= typedPromotion.min_order_value) {
          if (typedPromotion.discount_type === 'percentage') {
            promotionDiscount = Math.min(
              rawSubtotal * (typedPromotion.discount_value / 100),
              typedPromotion.max_discount_cap ?? Infinity
            )
          } else if (typedPromotion.discount_type === 'fixed') {
            promotionDiscount = typedPromotion.discount_value
          }
        }
      }
    }

    // ── 4. Apply fixed combo bundle pricing ────────────────
    const nowIso = new Date().toISOString()
    const { data: comboPromotions, error: comboError } = await supabase
      .from('combo_promotions')
      .select(`
        id,
        name_en,
        name_ar,
        promo_price,
        original_price,
        is_active,
        items:combo_promotion_items (
          product_id,
          quantity,
          item_role,
          display_order
        )
      `)
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)

    if (comboError) throw comboError

    const comboSummary = evaluateComboPricing(
      payload.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      })),
      ((comboPromotions ?? []) as ComboPromotionRow[]).map((combo) => ({
        id: combo.id,
        name_en: combo.name_en,
        name_ar: combo.name_ar,
        promo_price: combo.promo_price,
        original_price: combo.original_price,
        is_active: combo.is_active,
        items: (combo.items ?? []).map((item: {
          product_id: string
          quantity: number
          item_role: ComboItemRole
          display_order: number
        }) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          item_role: item.item_role,
          display_order: item.display_order,
        })),
      }))
    )
    const discountAmount = promotionDiscount + comboSummary.comboDiscount

    // ── 5. Calculate totals ─────────────────────────────────
    let subtotal = 0
    const orderItemsData: Array<{
      product_id: string
      product_snapshot: object
      quantity: number
      unit_price: number
      total_price: number
      notes: string | null
      modifiers: Array<{ option_id: string; snapshot: object; price_delta: number }>
    }> = []

    for (const item of payload.items) {
      const product = productMap.get(item.product_id)!
      const modTotal = item.selected_modifier_option_ids.reduce((sum, id) => {
        return sum + (modifierMap.get(id)?.price_delta ?? 0)
      }, 0)
      const unitPrice = product.base_price + modTotal
      const totalPrice = unitPrice * item.quantity
      subtotal += totalPrice

      orderItemsData.push({
        product_id: item.product_id,
        product_snapshot: product,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: item.notes ?? null,
        modifiers: item.selected_modifier_option_ids.map((id) => ({
          option_id: id,
          snapshot: modifierMap.get(id)!,
          price_delta: modifierMap.get(id)?.price_delta ?? 0,
        })),
      })
    }

    const { data: sysConfigs, error: sysErr } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['delivery_fee', 'free_delivery_enabled'])

    if (sysErr) throw sysErr

    const cfg = new Map((sysConfigs ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
    const freeDeliveryEnabledRaw = cfg.get('free_delivery_enabled')
    const freeDeliveryEnabled =
      typeof freeDeliveryEnabledRaw === 'boolean'
        ? freeDeliveryEnabledRaw
        : typeof freeDeliveryEnabledRaw === 'string'
          ? freeDeliveryEnabledRaw === 'true'
          : typeof freeDeliveryEnabledRaw === 'object' && freeDeliveryEnabledRaw !== null
            ? (freeDeliveryEnabledRaw as { enabled?: boolean }).enabled === true
            : false

    const deliveryFeeRaw = cfg.get('delivery_fee')
    const deliveryFeeValue =
      typeof deliveryFeeRaw === 'number'
        ? deliveryFeeRaw
        : typeof deliveryFeeRaw === 'string'
          ? parseFloat(deliveryFeeRaw)
          : typeof deliveryFeeRaw === 'object' && deliveryFeeRaw !== null
            ? parseFloat(String((deliveryFeeRaw as { fee?: number | string }).fee ?? '5.000'))
            : 5.0

    const deliveryFee = fulfillmentMode === 'hotel_room_delivery'
      ? 0
      : (promotion?.discount_type === 'free_delivery' || freeDeliveryEnabled)
        ? 0
        : (Number.isFinite(deliveryFeeValue) ? deliveryFeeValue : 5.0)

    const total = Math.max(0, subtotal - discountAmount + deliveryFee)
    const resolvedCustomerName = payload.customer_name
      ?? (fulfillmentMode === 'hotel_room_delivery' && isHotelRoomAddress(payload.delivery_address)
        ? payload.delivery_address.guest_name
        : null)

    // ── 6. Upsert customer (auth users: id = auth.uid(); guests: match by phone) ──
    const deliveryAddresses = [
      {
        id: crypto.randomUUID(),
        label: fulfillmentMode === 'hotel_room_delivery' ? 'Room delivery' : 'Home',
        mode: fulfillmentMode,
        ...payload.delivery_address,
        is_default: true,
      },
    ]

    let customer: CustomerRow | null = null

    if (authUserId) {
      await supabase
        .from('customers')
        .update({ phone_e164: null })
        .eq('phone_e164', payload.phone_e164)
        .neq('id', authUserId)

      const { data: authCustomer, error: authCustErr } = await supabase
        .from('customers')
        .upsert(
          {
            id: authUserId,
            phone_e164: payload.phone_e164,
            name: resolvedCustomerName,
            email: authEmail,
            language_pref: payload.language_pref,
            delivery_addresses: deliveryAddresses,
          },
          { onConflict: 'id' }
        )
        .select()
        .single()

      if (authCustErr) throw authCustErr
      customer = authCustomer as CustomerRow | null
    } else {
      const { data: guestCustomer, error: guestErr } = await supabase
        .from('customers')
        .upsert(
          {
            phone_e164: payload.phone_e164,
            name: resolvedCustomerName,
            language_pref: payload.language_pref,
            delivery_addresses: deliveryAddresses,
          },
          { onConflict: 'phone_e164', ignoreDuplicates: false }
        )
        .select()
        .single()

      if (guestErr) throw guestErr
      customer = guestCustomer as CustomerRow | null
    }

    if (!customer?.id) {
      throw new Error('Could not resolve customer record')
    }

    // ── 7. Create order atomically ──────────────────────────
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: customer.id,
        promotion_id: promotion?.id ?? null,
        organization_id: tenantScope.organization_id,
        cluster_id: tenantScope.cluster_id,
        property_id: tenantScope.property_id,
        fulfillment_mode: fulfillmentMode,
        status: 'pending',
        delivery_address: {
          mode: fulfillmentMode,
          ...payload.delivery_address,
        },
        delivery_fee: deliveryFee,
        subtotal: Math.round(subtotal * 1000) / 1000,
        discount_amount: Math.round(discountAmount * 1000) / 1000,
        total: Math.round(total * 1000) / 1000,
        payment_method: payload.payment_method,
        special_instructions: payload.special_instructions ?? null,
        language_pref: payload.language_pref,
        promo_code_entered: payload.promo_code ?? null,
      })
      .select()
      .single()

    if (orderErr) throw orderErr

    // ── 8. Insert order items ───────────────────────────────
    const insertedItems = await Promise.all(
      orderItemsData.map(async (itemData) => {
        const { data: item, error: itemErr } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            product_id: itemData.product_id,
            product_snapshot: itemData.product_snapshot,
            quantity: itemData.quantity,
            unit_price: itemData.unit_price,
            total_price: itemData.total_price,
            notes: itemData.notes,
          })
          .select()
          .single()

        if (itemErr) throw itemErr

        // Insert modifiers
        if (itemData.modifiers.length > 0) {
          await supabase.from('order_item_modifiers').insert(
            itemData.modifiers.map((m) => ({
              order_item_id: item.id,
              modifier_option_id: m.option_id,
              option_snapshot: m.snapshot,
              price_delta: m.price_delta,
            }))
          )
        }

        return item
      })
    )

    let paymentSession: { payment_url: string; transaction_id: string; provider: 'qpay' | 'stripe' } | null = null

    if (payload.payment_method === 'card') {
      const qpayWebhookUrl = Deno.env.get('QPAY_WEBHOOK_URL')
      const customerAppUrl = Deno.env.get('CUSTOMER_APP_URL')

      if (!qpayWebhookUrl) {
        throw new Error('QPAY_WEBHOOK_URL is not configured')
      }

      if (!customerAppUrl) {
        throw new Error('CUSTOMER_APP_URL is not configured')
      }

      const qpayResponse = await initiateQPayPayment({
        orderId: order.id,
        amount: order.total,
        currency: 'QAR',
        customerPhone: payload.phone_e164,
        customerName: resolvedCustomerName ?? undefined,
        callbackUrl: qpayWebhookUrl,
        returnUrl: `${customerAppUrl.replace(/\/$/, '')}/orders/${order.id}`,
        description: `Payment for order ${order.id}`,
      })

      const { error: paymentInsertError } = await supabase.from('payments').insert({
        order_id: order.id,
        payment_provider: 'qpay',
        provider_transaction_id: qpayResponse.transaction_id,
        provider_payment_reference: qpayResponse.reference_id,
        amount: order.total,
        currency: 'QAR',
        payment_method: payload.payment_method,
        status: qpayResponse.status === 'captured' ? 'captured' : 'pending',
        provider_response: qpayResponse.raw,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        captured_at: qpayResponse.status === 'captured' ? new Date().toISOString() : null,
      })

      if (paymentInsertError) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancellation_reason: 'payment initialization failed',
          })
          .eq('id', order.id)

        throw paymentInsertError
      }

      if (!qpayResponse.payment_url) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancellation_reason: 'payment provider did not return a payment URL',
          })
          .eq('id', order.id)

        throw new Error('Payment gateway did not return a redirect URL')
      }

      paymentSession = {
        payment_url: qpayResponse.payment_url,
        transaction_id: qpayResponse.transaction_id,
        provider: 'qpay',
      }
    } else if (payload.payment_method === 'online') {
      const customerAppUrl = Deno.env.get('CUSTOMER_APP_URL')

      if (!customerAppUrl) {
        throw new Error('CUSTOMER_APP_URL is not configured')
      }

      const customerAppBaseUrl = customerAppUrl.replace(/\/$/, '')
      const stripeResponse = await initiateStripeCheckoutSession({
        orderId: order.id,
        amount: order.total,
        currency: 'QAR',
        customerEmail: customer.email ?? authEmail,
        customerName: resolvedCustomerName ?? customer.name ?? undefined,
        successUrl: `${customerAppBaseUrl}/track/${order.id}?checkout_session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${customerAppBaseUrl}/checkout?payment=cancelled&order_id=${order.id}`,
        description: `Payment for order ${order.id}`,
        idempotencyKey: `stripe-checkout-${order.id}`,
        metadata: {
          order_id: order.id,
          customer_id: customer.id,
        },
      })

      const { error: paymentInsertError } = await supabase.from('payments').insert({
        order_id: order.id,
        payment_provider: 'stripe',
        provider_transaction_id: stripeResponse.paymentIntentId,
        provider_payment_reference: stripeResponse.sessionId,
        provider_session_id: stripeResponse.sessionId,
        stripe_payment_intent_id: stripeResponse.paymentIntentId,
        stripe_checkout_session_id: stripeResponse.sessionId,
        amount: order.total,
        currency: 'QAR',
        payment_method: payload.payment_method,
        status: 'pending',
        provider_response: stripeResponse.raw,
        idempotency_key: `stripe-checkout-${order.id}`,
        metadata: {
          order_id: order.id,
          customer_id: customer.id,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (paymentInsertError) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancellation_reason: 'stripe payment initialization failed',
          })
          .eq('id', order.id)

        throw paymentInsertError
      }

      paymentSession = {
        payment_url: stripeResponse.checkoutUrl,
        transaction_id: stripeResponse.paymentIntentId ?? stripeResponse.sessionId,
        provider: 'stripe',
      }
    }

    // ── 9. Write order_created event ────────────────────────
    await supabase.from('order_events').insert({
      order_id: order.id,
      event_type: 'order.created',
      to_status: 'pending',
      actor_role: 'customer',
      actor_id: customer.id,
      payload: {
        item_count: payload.items.length,
        subtotal: order.subtotal,
        total: order.total,
        has_promo: !!promotion,
        promo_code: payload.promo_code ?? null,
        combos_applied: comboSummary.matchedCombos.map((combo) => ({
          combo_promotion_id: combo.combo_promotion_id,
          quantity: combo.quantity,
          savings: combo.savings,
        })),
      },
      idempotency_key: `${order.id}::order.created::system::${Math.floor(Date.now() / 60000)}`,
    })

    await supabase.from('audit_logs').insert({
      action: 'order.created',
      actor_id: customer.id,
      actor_role: 'customer',
      entity_type: 'order',
      entity_id: order.id,
      metadata: {
        total: order.total,
        item_count: payload.items.length,
        payment_method: payload.payment_method,
      },
    })

    // ── 10. Increment promo usage ───────────────────────────
    if (promotion) {
      await supabase
        .from('promotions')
        .update({ usage_count: promotion.usage_count + 1 })
        .eq('id', promotion.id)
    }

    // ── 11. Send notification (async - don't await) ─────────
    supabase.functions.invoke('send-notification', {
      body: {
        event_type: 'order.created',
        order_id: order.id,
        customer_phone: payload.phone_e164,
        language: payload.language_pref,
        variables: {
          order_number: order.id.slice(0, 8).toUpperCase(),
        },
      },
    }).catch((notificationError) => {
      console.error('Customer notification dispatch failed:', notificationError)
    })

    supabase.functions.invoke('operator-notification-dispatch', {
      body: {
        event_type: 'order.created',
        order_id: order.id,
      },
    }).catch((dispatchError) => {
      console.error('Operator notification dispatch failed:', dispatchError)
    })

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        order_number: order.id.slice(0, 8).toUpperCase(),
        total: order.total,
        estimated_delivery_minutes: 45,
        payment_url: paymentSession?.payment_url ?? null,
        payment_transaction_id: paymentSession?.transaction_id ?? null,
        payment_provider: paymentSession?.provider ?? null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      }
    )
  } catch (err) {
    console.error('Place order error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isValidationError =
      message.includes('not found') ||
      message.includes('unavailable') ||
      message.includes('required') ||
      message.includes('first order')
    const statusCode = isValidationError ? 400 : 500
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: message,
        error_type: isValidationError ? 'validation' : 'server'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    )
  }
})
