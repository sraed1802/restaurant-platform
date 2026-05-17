// supabase/functions/auth-hook/index.ts
// This is a Supabase Auth Hook (custom access token hook)
// Configure it in: Dashboard → Auth → Hooks → Custom Access Token Hook
// Function URL: /functions/v1/auth-hook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AuthHookPayload {
  event: 'customAccessToken'
  user_id: string
  claims: Record<string, unknown>
}

serve(async (req) => {
  try {
    const payload: AuthHookPayload = await req.json()

    if (payload.event !== 'customAccessToken') {
      return new Response(JSON.stringify({ claims: payload.claims }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Look up staff role
    const { data: staff } = await supabase
      .from('staff')
      .select('app_role, is_active')
      .eq('id', payload.user_id)
      .single()

    const claims = { ...payload.claims }

    if (staff?.is_active) {
      // Inject role into app_metadata (accessible as user.app_metadata.role)
      claims.app_metadata = {
        ...(claims.app_metadata as Record<string, unknown> ?? {}),
        role: staff.app_role,
      }
      // Also set user_metadata for convenience
      claims.user_metadata = {
        ...(claims.user_metadata as Record<string, unknown> ?? {}),
        app_role: staff.app_role,
      }
    }

    return new Response(JSON.stringify({ claims }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Auth hook error:', err)
    // On error, return original claims (don't block login)
    return new Response(JSON.stringify({ claims: {} }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
