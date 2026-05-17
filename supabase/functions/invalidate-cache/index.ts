// supabase/functions/invalidate-cache/index.ts
// Called internally after menu edits, promo changes, or AI recompute
// Purges Netlify edge cache for the affected paths

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CacheTarget = 'menu' | 'promotions' | 'suggestions' | 'all'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) throw new Error('Unauthorized')

    const { targets }: { targets: CacheTarget[] } = await req.json()
    if (!targets?.length) throw new Error('targets array required')

    const netlifyToken = Deno.env.get('NETLIFY_AUTH_TOKEN')
    const netlifySiteId = Deno.env.get('NETLIFY_SITE_ID')

    const pathMap: Record<CacheTarget, string[]> = {
      menu:        ['/api/menu'],
      promotions:  ['/api/promotions'],
      suggestions: ['/api/suggestions'],
      all:         ['/api/menu', '/api/promotions', '/api/suggestions'],
    }

    const paths = [...new Set(targets.flatMap((t) => pathMap[t] ?? []))]
    const results: string[] = []

    if (netlifyToken && netlifySiteId) {
      for (const path of paths) {
        const res = await fetch(
          `https://api.netlify.com/api/v1/sites/${netlifySiteId}/edge_handlers/cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${netlifyToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths: [path] }),
          }
        )
        results.push(`${path}: ${res.status}`)
      }
    } else {
      // Development: just log
      results.push(...paths.map((p) => `[DEV] Would purge: ${p}`))
    }

    // Log invalidation event
    await supabase.from('analytics_events').insert({
      event_type: 'cache.invalidated',
      properties: { targets, paths, results, actor_id: user.id },
      partition_date: new Date().toISOString().split('T')[0],
    })

    return new Response(
      JSON.stringify({ success: true, purged: paths, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
