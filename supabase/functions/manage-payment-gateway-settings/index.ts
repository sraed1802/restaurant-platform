import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole } from '../_shared/staffAuth.ts'
import {
  coercePaymentGatewaySettings,
  loadPaymentGatewaySettings,
  savePaymentGatewaySettings,
  type PaymentGatewaySettings,
} from '../_shared/paymentGatewaySettings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentGatewayRequestBody {
  action?: 'get_public_settings' | 'get_settings' | 'update_settings'
  settings?: Partial<PaymentGatewaySettings>
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
    const body = await req.json() as PaymentGatewayRequestBody
    const action = body.action ?? 'get_public_settings'

    if (action === 'get_public_settings') {
      const settings = await loadPaymentGatewaySettings(supabase)

      return new Response(JSON.stringify({
        success: true,
        settings,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authenticatedStaff = await requireActiveStaff(req, supabase)

    if (action === 'get_settings') {
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])

      const settings = await loadPaymentGatewaySettings(supabase)

      return new Response(JSON.stringify({
        success: true,
        settings,
        can_view: true,
        can_edit: authenticatedStaff.staff.app_role === 'admin',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_settings') {
      requireStaffRole(authenticatedStaff, ['admin'])

      const currentSettings = await loadPaymentGatewaySettings(supabase)
      const nextSettings = coercePaymentGatewaySettings({
        ...currentSettings,
        ...(body.settings ?? {}),
      })

      await savePaymentGatewaySettings(supabase, nextSettings, authenticatedStaff.staff.id)

      await supabase.from('audit_logs').insert({
        action: 'payment_gateway.settings_updated',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'system_config',
        entity_id: null,
        metadata: {
          key: 'payment_gateway_settings',
          previous_settings: currentSettings,
          next_settings: nextSettings,
        },
      })

      return new Response(JSON.stringify({
        success: true,
        settings: nextSettings,
        can_view: true,
        can_edit: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Invalid action')
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
