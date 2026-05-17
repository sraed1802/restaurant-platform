// supabase/functions/compute-ai-suggestions/index.ts
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const now = new Date()
    const currentHour = now.getHours()
    const currentDow = now.getDay()

    // ── Load scoring weights from config ───────────────────
    const { data: weightConfig } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'ai_scoring_weights')
      .single()

    const weights = (weightConfig?.value as Record<string, number>) ?? {
      popularity: 0.35,
      revenue: 0.25,
      affinity: 0.20,
      promo_conversion: 0.15,
      recency: 0.05,
    }

    // ── Load product popularity ────────────────────────────
    const { data: popularity } = await supabase
      .from('mv_product_popularity')
      .select('*')

    if (!popularity || popularity.length === 0) {
      throw new Error('No product popularity data available')
    }

    // Normalize popularity scores
    const maxOrders = Math.max(...popularity.map((p: { order_count: number }) => p.order_count))
    const maxRevenue = Math.max(...popularity.map((p: { total_revenue: number }) => p.total_revenue))

    // ── Load peak demand for current hour ──────────────────
    const { data: peakData } = await supabase
      .from('mv_peak_demand')
      .select('*')
      .eq('hour_of_day', currentHour)
      .eq('day_of_week', currentDow)

    const peakOrderCount = peakData?.[0]?.order_count ?? 0
    const maxPeakCount = 50 // Reasonable max for normalization
    const demandIndex = Math.min(peakOrderCount / maxPeakCount, 1.0)

    // ── Load promo performance ─────────────────────────────
    const { data: promoPerf } = await supabase
      .from('mv_promo_performance')
      .select('id, orders_used, usage_count')

    const promoMap = new Map(
      promoPerf?.map((p: { id: string; orders_used: number; usage_count: number }) => [
        p.id,
        p.usage_count > 0 ? p.orders_used / p.usage_count : 0,
      ]) ?? []
    )
    const maxPromoConversion = Math.max(...(promoPerf?.map((p: { id: string; orders_used: number; usage_count: number }) =>
      p.usage_count > 0 ? p.orders_used / p.usage_count : 0
    ) ?? [1]))

    // ── Score each product ─────────────────────────────────
    const rankedProducts = popularity.map((p: {
      id: string
      order_count: number
      total_revenue: number
      name_en: string
      category_id: string
    }) => {
      const normalizedPopularity = maxOrders > 0 ? p.order_count / maxOrders : 0
      const normalizedRevenue = maxRevenue > 0 ? p.total_revenue / maxRevenue : 0
      const recencyBoost = demandIndex

      const score =
        weights.popularity * normalizedPopularity +
        weights.revenue * normalizedRevenue +
        weights.affinity * 0.5 + // Default affinity — overridden client-side per session
        weights.promo_conversion * 0 + // Product-level promo conversion N/A here
        weights.recency * recencyBoost

      return {
        product_id: p.id,
        score: Math.round(score * 10000) / 10000,
        reasons: [
          normalizedPopularity > 0.7 ? 'highly_popular' : null,
          normalizedRevenue > 0.7 ? 'top_revenue' : null,
          demandIndex > 0.6 ? 'trending_now' : null,
        ].filter(Boolean) as string[],
      }
    }).sort((a: { score: number }, b: { score: number }) => b.score - a.score)

    // ── Score promotions ───────────────────────────────────
    const { data: promotions } = await supabase
      .from('promotions')
      .select('id, ai_rank_score, type, discount_type')
      .eq('is_active', true)
      .order('ai_rank_score', { ascending: false })

    const rankedPromotions = (promotions ?? []).map((p: {
      id: string
      ai_rank_score: number
      type: string
    }) => {
      const conversionRate = promoMap.get(p.id) ?? 0
      const normalizedConversion = maxPromoConversion > 0
        ? conversionRate / maxPromoConversion
        : 0

      const score =
        0.6 * p.ai_rank_score +
        0.4 * normalizedConversion

      return {
        promotion_id: p.id,
        score: Math.round(score * 10000) / 10000,
      }
    }).sort((a: { score: number }, b: { score: number }) => b.score - a.score)

    // ── Write to cache ─────────────────────────────────────
    const cachePayload = {
      ranked_products: rankedProducts.slice(0, 20),
      ranked_promotions: rankedPromotions.slice(0, 5),
      computed_for_hour: currentHour,
      version: `v${Date.now()}`,
    }

    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()

    await supabase
      .from('ai_suggestion_cache')
      .upsert({
        cache_key: 'global_menu_rank',
        suggestion_payload: cachePayload,
        confidence_score: Math.min(0.5 + popularity.length * 0.01, 0.99),
        computed_at: now.toISOString(),
        expires_at: expiresAt,
        metadata: {
          products_scored: popularity.length,
          promotions_scored: (promotions ?? []).length,
          demand_index: demandIndex,
        },
      }, { onConflict: 'cache_key' })

    return new Response(
      JSON.stringify({
        success: true,
        products_scored: rankedProducts.length,
        expires_at: expiresAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
