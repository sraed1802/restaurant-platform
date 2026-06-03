// supabase/functions/auth-hook/index.ts
// Supabase Auth → Hooks → Custom Access Token (HTTPS endpoint)
// Deploy with JWT verification OFF: supabase functions deploy auth-hook --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

interface HookPayload {
  user_id: string
  claims: Record<string, unknown>
  authentication_method?: string
}

function hookSecret(): string {
  const raw =
    Deno.env.get('AUTH_HOOK_SECRET') ??
    Deno.env.get('CUSTOM_ACCESS_TOKEN_HOOK_SECRET') ??
  ''
  return raw.replace(/^v1,whsec_/, '')
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payloadText = await req.text()
  let userId: string
  let claims: Record<string, unknown>

  const secret = hookSecret()
  if (secret) {
    try {
      const headers = Object.fromEntries(req.headers)
      const wh = new Webhook(secret)
      const verified = wh.verify(payloadText, headers) as HookPayload
      userId = verified.user_id
      claims = { ...verified.claims }
    } catch (err) {
      console.error('Auth hook signature verification failed:', err)
      return new Response(
        JSON.stringify({
          error: {
            http_code: 401,
            message: 'Hook requires authorization token',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }
  } else {
    // Local dev fallback when hook secret is not configured.
    const body = JSON.parse(payloadText) as HookPayload
    userId = body.user_id
    claims = { ...(body.claims ?? {}) }
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: staff } = await supabase
      .from('staff')
      .select('app_role, is_active')
      .eq('id', userId)
      .single()

    if (staff?.is_active) {
      claims.app_metadata = {
        ...((claims.app_metadata as Record<string, unknown> | undefined) ?? {}),
        role: staff.app_role,
      }
      claims.user_metadata = {
        ...((claims.user_metadata as Record<string, unknown> | undefined) ?? {}),
        app_role: staff.app_role,
      }
    }

    return new Response(JSON.stringify({ claims }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Auth hook error:', err)
    return new Response(JSON.stringify({ claims }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
