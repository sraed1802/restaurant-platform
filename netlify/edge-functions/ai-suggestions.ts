// netlify/edge-functions/ai-suggestions.ts
import type { Config, Context } from '@netlify/edge-functions'

export default async function handler(req: Request, context: Context): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(new URL('/api/suggestions', req.url).toString())
  const TTL_MS = 15 * 60 * 1000 // 15 minutes

  const cached = await cache.match(cacheKey)
  if (cached) {
    const age = Date.now() - Number(cached.headers.get('x-cached-at') ?? '0')
    if (age < TTL_MS) {
      return new Response(cached.body, {
        headers: { ...Object.fromEntries(cached.headers.entries()), 'x-cache': 'HIT' },
      })
    }
    // Return stale, revalidate in background
    context.waitUntil(revalidateSuggestions(cacheKey, cache))
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers.entries()), 'x-cache': 'STALE' },
    })
  }

  const data = await fetchSuggestions()
  const response = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=60',
      'x-cached-at': String(Date.now()),
      'x-cache': 'MISS',
    },
  })
  context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

async function fetchSuggestions() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const now = new Date().toISOString()

  const res = await fetch(
    `${supabaseUrl}/rest/v1/ai_suggestion_cache?cache_key=eq.global_menu_rank&expires_at=gt.${now}&limit=1`,
    { headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` } }
  )
  const rows = await res.json()

  if (!rows.length) {
    // Trigger recompute async and return empty
    fetch(`${supabaseUrl}/functions/v1/compute-ai-suggestions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
    }).catch(() => {})
    return { ranked_products: [], ranked_promotions: [], computed_at: null, fresh: false }
  }

  return { ...rows[0].suggestion_payload, computed_at: rows[0].computed_at, fresh: true }
}

async function revalidateSuggestions(key: Request, cache: Cache) {
  try {
    const data = await fetchSuggestions()
    await cache.put(key, new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'x-cached-at': String(Date.now()),
        'x-cache': 'REVALIDATED',
      },
    }))
  } catch (e) {
    console.error('[ai-suggestions] revalidation failed:', e)
  }
}

export const config: Config = { path: '/api/suggestions' }
