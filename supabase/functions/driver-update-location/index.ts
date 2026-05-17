import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveDriver } from '../_shared/driverAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LocationBody {
  lat?: number
  lng?: number
  accuracy_m?: number
  heading?: number
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
    const authenticatedDriver = await requireActiveDriver(req, supabase)
    const driver = authenticatedDriver.driver
    const body = (await req.json()) as LocationBody

    const lat = Number(body.lat)
    const lng = Number(body.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('lat and lng are required numbers')
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Invalid coordinates')
    }

    const location = {
      lat,
      lng,
      accuracy_m: Number.isFinite(Number(body.accuracy_m)) ? Number(body.accuracy_m) : null,
      heading: Number.isFinite(Number(body.heading)) ? Number(body.heading) : null,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('drivers')
      .update({
        current_location: location,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', driver.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, data: { location } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
