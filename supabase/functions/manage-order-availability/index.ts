import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole } from '../_shared/staffAuth.ts'
import {
  coerceOrderAvailabilityScope,
  coerceOrderAvailabilitySettings,
  evaluateOrderAvailability,
  loadOrderAvailabilitySettings,
  saveOrderAvailabilitySettings,
  type OrderAvailabilitySettings,
} from '../_shared/orderAvailability.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderAvailabilityRequestBody {
  action?: 'get_public_status' | 'get_settings' | 'update_settings'
  scope?: unknown
  settings?: Partial<OrderAvailabilitySettings>
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
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json() as OrderAvailabilityRequestBody
    const action = body.action ?? 'get_public_status'
    const scope = coerceOrderAvailabilityScope(body.scope)

    if (action === 'get_public_status') {
      const settings = await loadOrderAvailabilitySettings(supabase, scope)
      const status = evaluateOrderAvailability(settings)

      return new Response(JSON.stringify({
        success: true,
        status,
        settings: {
          timezone: settings.timezone,
          closure_message_en: settings.closure_message_en,
          closure_message_ar: settings.closure_message_ar,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authenticatedStaff = await requireActiveStaff(req, supabase)

    if (action === 'get_settings') {
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])

      const settings = await loadOrderAvailabilitySettings(supabase, scope)
      const status = evaluateOrderAvailability(settings)

      return new Response(JSON.stringify({
        success: true,
        settings,
        status,
        can_view: true,
        can_edit: authenticatedStaff.staff.app_role === 'admin',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_settings') {
      requireStaffRole(authenticatedStaff, ['admin'])

      const currentSettings = await loadOrderAvailabilitySettings(supabase, scope)
      const nextSettings = coerceOrderAvailabilitySettings({
        ...currentSettings,
        ...(body.settings ?? {}),
        weekly_windows: body.settings?.weekly_windows ?? currentSettings.weekly_windows,
        overrides: body.settings?.overrides ?? currentSettings.overrides,
      }, scope)

      const savedSettings = await saveOrderAvailabilitySettings(
        supabase,
        nextSettings,
      )

      const { error: auditError } = await supabase.from('audit_logs').insert({
        action: 'order_availability.settings_updated',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'order_availability_settings',
        entity_id: savedSettings.id ?? null,
        metadata: {
          scope,
          previous_settings: currentSettings,
          next_settings: savedSettings,
        },
      })

      if (auditError) throw auditError

      return new Response(JSON.stringify({
        success: true,
        settings: savedSettings,
        status: evaluateOrderAvailability(savedSettings),
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
