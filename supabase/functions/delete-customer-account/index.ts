// supabase/functions/delete-customer-account/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { error: purgeError } = await userClient.rpc('purge_customer_pii', { p_user_id: user.id })

  if (purgeError) {
    const message =
      purgeError.message === 'not_a_customer_account'
        ? 'This account cannot be deleted from the customer app.'
        : purgeError.message === 'not_allowed'
          ? 'Not allowed.'
          : purgeError.message
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: purgeError.message === 'not_allowed' || purgeError.message === 'not_a_customer_account' ? 403 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id)

  if (deleteAuthError) {
    return new Response(
      JSON.stringify({ success: false, error: deleteAuthError.message ?? 'Failed to delete sign-in account' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
