// supabase/functions/send-notification/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `[${key}]`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { event_type, order_id, customer_phone, language, variables } = await req.json()

    // Load template
    const { data: template, error: templateErr } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('event_type', event_type)
      .eq('is_active', true)
      .single()

    if (templateErr || !template) {
      console.warn(`No template found for event: ${event_type}`)
      return new Response(JSON.stringify({ success: false, error: 'Template not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const body = language === 'ar'
      ? renderTemplate(template.body_ar, variables)
      : renderTemplate(template.body_en, variables)

    // Log to analytics
    await supabase.from('analytics_events').insert({
      event_type: 'notification.sent',
      entity_id: order_id,
      entity_type: 'order',
      properties: {
        notification_event: event_type,
        channel: template.channel,
        language,
        phone_last4: customer_phone?.slice(-4),
      },
      partition_date: new Date().toISOString().split('T')[0],
    })

    // ── SMS dispatch via Twilio (or configured provider) ──
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER')

    if (twilioAccountSid && twilioAuthToken && twilioFrom) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`
      const formData = new URLSearchParams({
        To: customer_phone,
        From: twilioFrom,
        Body: body,
      })

      const smsResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      if (!smsResponse.ok) {
        const error = await smsResponse.text()
        console.error('Twilio error:', error)
        // Don't throw — notification failure should not fail the order
      }
    } else {
      // Dev mode: log the message
      console.log(`[NOTIFICATION] ${language.toUpperCase()} → ${customer_phone}: ${body}`)
    }

    return new Response(
      JSON.stringify({ success: true, message_preview: body.slice(0, 50) + '...' }),
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
