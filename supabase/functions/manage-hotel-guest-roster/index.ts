import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole } from '../_shared/staffAuth.ts'
import {
  coerceFulfillmentScope,
  coerceHotelGuestRosterRows,
  getHotelGuestRosterSummary,
  lookupHotelGuestRosterByRoom,
  replaceHotelGuestRoster,
} from '../_shared/fulfillmentSettings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HotelGuestRosterRequestBody {
  action?: 'get_summary' | 'replace_roster' | 'lookup_room'
  scope?: unknown
  rows?: unknown
  room_number?: string
  source_file_name?: string | null
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
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    const body = await req.json() as HotelGuestRosterRequestBody
    const action = body.action ?? 'get_summary'
    const scope = coerceFulfillmentScope(body.scope)

    if (action === 'get_summary') {
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])
      const summary = await getHotelGuestRosterSummary(supabase, scope)

      return new Response(JSON.stringify({
        success: true,
        summary,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'lookup_room') {
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])
      const entries = await lookupHotelGuestRosterByRoom(supabase, scope, body.room_number ?? '')

      return new Response(JSON.stringify({
        success: true,
        entries,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'replace_roster') {
      requireStaffRole(authenticatedStaff, ['admin'])
      const rows = coerceHotelGuestRosterRows(body.rows)
      const sourceFileName = typeof body.source_file_name === 'string' ? body.source_file_name.trim() : null
      const summary = await replaceHotelGuestRoster(supabase, scope, rows, sourceFileName)

      await supabase.from('audit_logs').insert({
        action: 'hotel_guest_roster.replaced',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'hotel_guest_roster',
        entity_id: null,
        metadata: {
          scope,
          row_count: rows.length,
          source_file_name: sourceFileName,
        },
      })

      return new Response(JSON.stringify({
        success: true,
        summary,
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
