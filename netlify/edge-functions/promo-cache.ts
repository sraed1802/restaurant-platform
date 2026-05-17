// netlify/edge-functions/promo-cache.ts
import type { Config, Context } from '@netlify/edge-functions'

export default async function handler(req: Request, context: Context): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(new URL('/api/promotions', req.url).toString())
  const TTL_MS = 2 * 60 * 1000 // 2 minutes

  const cached = await cache.match(cacheKey)
  if (cached) {
    const age = Date.now() - Number(cached.headers.get('x-cached-at') ?? '0')
    if (age < TTL_MS) {
      return new Response(cached.body, {
        headers: { ...Object.fromEntries(cached.headers.entries()), 'x-cache': 'HIT' },
      })
    }
    context.waitUntil(revalidatePromos(cacheKey, cache))
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers.entries()), 'x-cache': 'STALE' },
    })
  }

  const data = await fetchPromos()
  const response = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=30',
      'x-cached-at': String(Date.now()),
      'x-cache': 'MISS',
    },
  })
  context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

async function fetchPromos() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const now = new Date().toISOString()
  const res = await fetch(
    `${supabaseUrl}/rest/v1/promotions?is_active=eq.true&or=(valid_until.is.null,valid_until.gt.${now})&order=ai_rank_score.desc`,
    { headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` } }
  )
  return res.json()
}

async function revalidatePromos(key: Request, cache: Cache) {
  try {
    const data = await fetchPromos()
    await cache.put(key, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'x-cached-at': String(Date.now()), 'x-cache': 'REVALIDATED' },
    }))
  } catch (e) { console.error('[promo-cache] revalidation failed:', e) }
}

export const config: Config = { path: '/api/promotions' }
