import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRoleRequest } from '../_shared/internalAuth.ts'
import type { OperatorNotificationEvent } from '../_shared/operatorNotificationSettings.ts'
import { isOperatorNotificationEnabled } from '../_shared/operatorNotificationSettings.ts'
import { buildOperatorNotificationContent, type OperatorOrderContext } from '../_shared/operatorNotificationContent.ts'
import {
  loadOperatorNotificationSettings,
  loadTelegramToken,
} from '../_shared/operatorNotificationStore.ts'
import { sendOperatorEmail } from '../_shared/integrations/email.ts'
import { sendTelegramMessage } from '../_shared/integrations/telegram.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DispatchRequestBody {
  event_type?: OperatorNotificationEvent
  order_id?: string
}

interface OrderRecord {
  id: string
  total: number
  created_at: string
  cancellation_reason: string | null
  customer_id: string | null
}

interface CustomerRecord {
  name: string | null
  phone_e164: string | null
  email: string | null
}

async function recordDelivery(
  supabase: SupabaseClient,
  values: {
    order_id: string
    notification_id?: string | null
    event_type: OperatorNotificationEvent
    channel: 'in_app' | 'email' | 'telegram'
    recipient?: string | null
    status: 'queued' | 'sent' | 'failed' | 'skipped'
    response_payload?: Record<string, unknown>
    error_message?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from('operator_notification_deliveries').insert({
    order_id: values.order_id,
    notification_id: values.notification_id ?? null,
    event_type: values.event_type,
    channel: values.channel,
    recipient: values.recipient ?? null,
    status: values.status,
    response_payload: values.response_payload ?? {},
    error_message: values.error_message ?? null,
  })

  if (error) {
    console.error('Failed to record operator delivery', error)
  }
}

async function loadOrderContext(
  supabase: SupabaseClient,
  orderId: string
): Promise<OperatorOrderContext> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total, created_at, cancellation_reason, customer_id')
    .eq('id', orderId)
    .single()

  const orderRecord = order as OrderRecord | null

  if (orderError || !orderRecord) {
    throw orderError ?? new Error('Order not found')
  }

  let customer: CustomerRecord | null = null
  if (orderRecord.customer_id) {
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('name, phone_e164, email')
      .eq('id', orderRecord.customer_id)
      .maybeSingle()

    if (customerError) throw customerError
    customer = customerData as CustomerRecord | null
  }

  return {
    orderId: orderRecord.id,
    orderNumber: orderRecord.id.slice(0, 8).toUpperCase(),
    total: Number(orderRecord.total ?? 0),
    customerName: customer?.name?.trim() || 'Guest customer',
    customerPhone: customer?.phone_e164 ?? null,
    customerEmail: customer?.email ?? null,
    cancellationReason: orderRecord.cancellation_reason ?? null,
    createdAt: orderRecord.created_at,
  }
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

  try {
    requireServiceRoleRequest(req)

    const body = await req.json() as DispatchRequestBody
    const eventType = body.event_type
    const orderId = body.order_id

    if (!eventType || !['order.created', 'order.cancelled'].includes(eventType)) {
      throw new Error('A supported event_type is required')
    }

    if (!orderId) {
      throw new Error('order_id is required')
    }

    const settings = await loadOperatorNotificationSettings(supabase)
    if (!isOperatorNotificationEnabled(settings, eventType)) {
      await supabase.from('audit_logs').insert({
        action: 'operator_notifications.dispatch_skipped',
        actor_role: 'system',
        entity_type: 'order',
        entity_id: orderId,
        metadata: {
          event_type: eventType,
          reason: 'event_disabled',
        },
      })

      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const order = await loadOrderContext(supabase, orderId)
    const content = buildOperatorNotificationContent(eventType, order)

    let notificationId: string | null = null
    const deliverySummary: Array<Record<string, unknown>> = []

    try {
      const { data: notificationRow, error: notificationError } = await supabase
        .from('operator_notifications')
        .insert({
          order_id: order.orderId,
          event_type: eventType,
          audience_roles: ['admin', 'manager'],
          title: content.title,
          message: content.message,
          payload: {
            order_number: order.orderNumber,
            customer_name: order.customerName,
            customer_phone: order.customerPhone,
            total: order.total,
            cancellation_reason: order.cancellationReason,
          },
        })
        .select('id')
        .single()

      if (notificationError) throw notificationError

      notificationId = notificationRow.id as string
      await recordDelivery(supabase, {
        order_id: order.orderId,
        notification_id: notificationId,
        event_type: eventType,
        channel: 'in_app',
        recipient: 'admin,manager',
        status: 'sent',
        response_payload: { notification_id: notificationId },
      })
      deliverySummary.push({ channel: 'in_app', status: 'sent' })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown in-app notification error'
      await recordDelivery(supabase, {
        order_id: order.orderId,
        event_type: eventType,
        channel: 'in_app',
        recipient: 'admin,manager',
        status: 'failed',
        error_message: errorMessage,
      })
      deliverySummary.push({ channel: 'in_app', status: 'failed', error: errorMessage })
    }

    if (settings.email_enabled && settings.email_recipients.length > 0) {
      for (const recipient of settings.email_recipients) {
        try {
          const result = await sendOperatorEmail({
            to: recipient,
            subject: content.emailSubject,
            html: content.emailHtml,
            text: content.emailText,
          })
          await recordDelivery(supabase, {
            order_id: order.orderId,
            notification_id: notificationId,
            event_type: eventType,
            channel: 'email',
            recipient,
            status: 'sent',
            response_payload: {
              provider: result.provider,
              provider_id: result.providerId,
            },
          })
          deliverySummary.push({ channel: 'email', recipient, status: 'sent' })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown email delivery error'
          await recordDelivery(supabase, {
            order_id: order.orderId,
            notification_id: notificationId,
            event_type: eventType,
            channel: 'email',
            recipient,
            status: 'failed',
            error_message: errorMessage,
          })
          deliverySummary.push({ channel: 'email', recipient, status: 'failed', error: errorMessage })
        }
      }
    } else {
      await recordDelivery(supabase, {
        order_id: order.orderId,
        notification_id: notificationId,
        event_type: eventType,
        channel: 'email',
        status: 'skipped',
        error_message: settings.email_enabled ? 'No email recipients configured' : 'Email notifications disabled',
      })
      deliverySummary.push({ channel: 'email', status: 'skipped' })
    }

    if (settings.telegram_enabled && settings.telegram_chat_ids.length > 0) {
      const telegramToken = await loadTelegramToken(supabase)

      if (!telegramToken) {
        const errorMessage = 'Telegram bot token is not configured'
        await recordDelivery(supabase, {
          order_id: order.orderId,
          notification_id: notificationId,
          event_type: eventType,
          channel: 'telegram',
          status: 'failed',
          error_message: errorMessage,
        })
        deliverySummary.push({ channel: 'telegram', status: 'failed', error: errorMessage })
      } else {
        for (const chatId of settings.telegram_chat_ids) {
          try {
            const result = await sendTelegramMessage({
              botToken: telegramToken,
              chatId,
              text: content.telegramText,
            })
            await recordDelivery(supabase, {
              order_id: order.orderId,
              notification_id: notificationId,
              event_type: eventType,
              channel: 'telegram',
              recipient: chatId,
              status: 'sent',
              response_payload: result.result ?? {},
            })
            deliverySummary.push({ channel: 'telegram', recipient: chatId, status: 'sent' })
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown Telegram delivery error'
            await recordDelivery(supabase, {
              order_id: order.orderId,
              notification_id: notificationId,
              event_type: eventType,
              channel: 'telegram',
              recipient: chatId,
              status: 'failed',
              error_message: errorMessage,
            })
            deliverySummary.push({ channel: 'telegram', recipient: chatId, status: 'failed', error: errorMessage })
          }
        }
      }
    } else {
      await recordDelivery(supabase, {
        order_id: order.orderId,
        notification_id: notificationId,
        event_type: eventType,
        channel: 'telegram',
        status: 'skipped',
        error_message: settings.telegram_enabled ? 'No Telegram chat IDs configured' : 'Telegram notifications disabled',
      })
      deliverySummary.push({ channel: 'telegram', status: 'skipped' })
    }

    await supabase.from('audit_logs').insert({
      action: 'operator_notifications.dispatch_completed',
      actor_role: 'system',
      entity_type: 'order',
      entity_id: order.orderId,
      metadata: {
        event_type: eventType,
        notification_id: notificationId,
        deliveries: deliverySummary,
      },
    })

    return new Response(JSON.stringify({
      success: true,
      notification_id: notificationId,
      deliveries: deliverySummary,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Operator notification dispatch failed', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
