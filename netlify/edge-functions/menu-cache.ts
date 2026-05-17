// netlify/edge-functions/menu-cache.ts
import type { Config, Context } from '@netlify/edge-functions'

export default async function handler(req: Request, context: Context): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(new URL('/api/menu', req.url).toString())

  // Try cache first
  const cached = await cache.match(cacheKey)
  if (cached) {
    const cachedAt = Number(cached.headers.get('x-cached-at') ?? '0')
    const age = Date.now() - cachedAt
    const TTL_MS = 5 * 60 * 1000 // 5 minutes

    if (age < TTL_MS) {
      return new Response(cached.body, {
        headers: {
          ...Object.fromEntries(cached.headers.entries()),
          'x-cache': 'HIT',
          'x-cache-age': String(Math.floor(age / 1000)) + 's',
        },
      })
    }

    // Stale: return immediately + revalidate in background
    context.waitUntil(revalidateMenu(cacheKey, cache))
    return new Response(cached.body, {
      headers: {
        ...Object.fromEntries(cached.headers.entries()),
        'x-cache': 'STALE',
        'x-cache-age': String(Math.floor(age / 1000)) + 's',
      },
    })
  }

  // Cache miss: fetch fresh
  const fresh = await fetchMenu()
  const response = buildResponse(fresh)
  context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

async function fetchMenu(): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const [catRes, prodRes, comboRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/categories?is_active=eq.true&order=display_order`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
    }),
    fetch(`${supabaseUrl}/rest/v1/products?is_available=eq.true&order=display_order&select=*,product_modifier_groups(display_order,modifier_groups(*,modifier_options(*)))`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    }),
    fetch(`${supabaseUrl}/rest/v1/combo_rules?is_active=eq.true&order=priority.desc`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    }),
  ])

  const [categories, products, combos] = await Promise.all([
    catRes.json(), prodRes.json(), comboRes.json()
  ])

  return { categories, products, combos, cached_at: Date.now() }
}

async function revalidateMenu(key: Request, cache: Cache): Promise<void> {
  try {
    const fresh = await fetchMenu()
    await cache.put(key, buildResponse(fresh))
  } catch (e) {
    console.error('[menu-cache] revalidation failed:', e)
  }
}

function buildResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      'x-cached-at': String(Date.now()),
      'x-cache': 'MISS',
      'Vary': 'Accept-Encoding',
    },
  })
}

export const config: Config = { path: '/api/menu' }
