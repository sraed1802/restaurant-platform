// supabase/functions/marketing-unsubscribe/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function escapeHtml(s: string) {
  return s
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const ok = url.searchParams.get('ok') === '1'
    const msg = ok
      ? `<p style="margin:12px 0 0; color:#14532d; background:#dcfce7; border:1px solid #86efac; padding:10px 12px; border-radius:10px;">You have been unsubscribed.</p>`
      : ''
    return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Unsubscribe</title>
  </head>
  <body style="margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#0b0e14; color:#fff;">
    <div style="max-width:520px; margin:0 auto; padding:40px 18px;">
      <h1 style="margin:0; font-size:26px;">Unsubscribe</h1>
      <p style="color:rgba(255,255,255,.75); line-height:1.6;">
        Enter your email address to stop receiving promotional campaigns.
      </p>
      ${msg}
      <form method="post" style="margin-top:18px; display:flex; flex-direction:column; gap:10px;">
        <label style="font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.65);">Email</label>
        <input name="email" type="email" placeholder="you@example.com"
          style="padding:12px 14px; border-radius:12px; border:1px solid rgba(184,151,90,.35); background:#111827; color:#fff;" />
        <button type="submit"
          style="padding:12px 14px; border-radius:999px; border:0; background:#b8975a; color:#0b0e14; font-weight:800; cursor:pointer;">
          Unsubscribe
        </button>
      </form>
      <p style="margin-top:16px; color:rgba(255,255,255,.55); font-size:12px; line-height:1.6;">
        If you unsubscribed by mistake, contact the restaurant and we can re-enable updates.
      </p>
    </div>
  </body>
</html>`)
  }

  if (req.method !== 'POST') {
    return html('Method not allowed', 405)
  }

  const contentType = req.headers.get('content-type') ?? ''
  let email = ''
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    email = String(form.get('email') ?? '').trim().toLowerCase()
  } else {
    try {
      const body = await req.json()
      email = String(body.email ?? '').trim().toLowerCase()
    } catch {
      email = ''
    }
  }

  if (!EMAIL_RE.test(email)) {
    return html(`<p>Invalid email.</p><p><a href="${escapeHtml(url.origin + url.pathname)}">Back</a></p>`, 400)
  }

  // Opt out all customers with this email (guests may have multiple customer rows historically).
  await supabase
    .from('customers')
    .update({ marketing_opt_out: true, marketing_opt_out_at: new Date().toISOString() })
    .eq('email', email)

  const redirect = new URL(url.origin + url.pathname)
  redirect.searchParams.set('ok', '1')
  return new Response('', { status: 302, headers: { Location: redirect.toString(), ...corsHeaders } })
})

