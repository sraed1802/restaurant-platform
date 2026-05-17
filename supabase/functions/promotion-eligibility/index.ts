import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasCustomerPlacedOrder } from '../_shared/promotionEligibility.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PromotionEligibilityPayload {
  phone_e164?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const payload = (await req.json().catch(() => ({}))) as PromotionEligibilityPayload

    const authHeader = req.headers.get('Authorization')
    let authUserId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7).trim()
      const { data: userData, error: authError } = await supabase.auth.getUser(jwt)
      if (!authError && userData.user) {
        authUserId = userData.user.id
      }
    }

    const hasPlacedOrder = await hasCustomerPlacedOrder(supabase, {
      authUserId,
      phoneE164: payload.phone_e164 ?? null,
    })

    return new Response(JSON.stringify({ hasPlacedOrder }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
