export type ComboItemRole = 'main' | 'side' | 'drink' | 'dessert' | 'optional_drink'

export interface ComboPricingItem {
  product_id: string
  quantity: number
  item_role: ComboItemRole
  display_order: number
}

export interface ComboPricingPromotion {
  id: string
  name_en: string
  name_ar: string
  promo_price: number
  original_price: number
  is_active: boolean
  items: ComboPricingItem[]
}

export interface ComboPricingCartLine {
  product_id: string
  quantity: number
}

export interface AppliedComboMatch {
  combo_promotion_id: string
  name_en: string
  name_ar: string
  quantity: number
  promo_price: number
  original_price: number
  savings: number
  matched_product_ids: string[]
}

export interface ComboPricingSummary {
  matchedCombos: AppliedComboMatch[]
  comboDiscount: number
  comboBundleTotal: number
  comboOriginalTotal: number
}

type RemainingState = Record<string, number>

function buildRemainingState(lines: ComboPricingCartLine[]): RemainingState {
  return lines.reduce<RemainingState>((acc, line) => {
    if (!line.product_id || line.quantity <= 0) return acc
    acc[line.product_id] = (acc[line.product_id] ?? 0) + line.quantity
    return acc
  }, {})
}

function getBundleLimit(combo: ComboPricingPromotion, remaining: RemainingState): number {
  let limit = Number.POSITIVE_INFINITY

  for (const item of combo.items) {
    if (item.quantity <= 0) return 0
    const available = remaining[item.product_id] ?? 0
    limit = Math.min(limit, Math.floor(available / item.quantity))
    if (limit === 0) return 0
  }

  return Number.isFinite(limit) ? limit : 0
}

function cloneAndConsume(
  remaining: RemainingState,
  combo: ComboPricingPromotion,
  quantity: number
): RemainingState {
  const next = { ...remaining }

  for (const item of combo.items) {
    const consumed = item.quantity * quantity
    next[item.product_id] = Math.max(0, (next[item.product_id] ?? 0) - consumed)
  }

  return next
}

function serializeState(index: number, remaining: RemainingState): string {
  const parts = Object.keys(remaining)
    .sort()
    .map((key) => `${key}:${remaining[key]}`)
  return `${index}|${parts.join(',')}`
}

function normalizePromotions(promotions: ComboPricingPromotion[]): ComboPricingPromotion[] {
  return promotions
    .filter((combo) => combo.is_active && combo.items.length > 0)
    .map((combo) => ({
      ...combo,
      items: combo.items
        .filter((item) => item.product_id && item.quantity > 0)
        .sort((a, b) => a.display_order - b.display_order),
    }))
    .filter((combo) => combo.items.length > 0 && combo.original_price > combo.promo_price)
}

function getMatchedProductIds(combo: ComboPricingPromotion): string[] {
  return [...new Set(combo.items.map((item) => item.product_id))]
}

export function evaluateComboPricing(
  lines: ComboPricingCartLine[],
  promotions: ComboPricingPromotion[]
): ComboPricingSummary {
  const combos = normalizePromotions(promotions)
  if (!combos.length) {
    return {
      matchedCombos: [],
      comboDiscount: 0,
      comboBundleTotal: 0,
      comboOriginalTotal: 0,
    }
  }

  const initialRemaining = buildRemainingState(lines)
  const memo = new Map<string, ComboPricingSummary>()

  function search(index: number, remaining: RemainingState): ComboPricingSummary {
    if (index >= combos.length) {
      return {
        matchedCombos: [],
        comboDiscount: 0,
        comboBundleTotal: 0,
        comboOriginalTotal: 0,
      }
    }

    const cacheKey = serializeState(index, remaining)
    const cached = memo.get(cacheKey)
    if (cached) return cached

    const combo = combos[index]
    const bundleLimit = getBundleLimit(combo, remaining)
    let best = search(index + 1, remaining)

    for (let quantity = 1; quantity <= bundleLimit; quantity += 1) {
      const nextRemaining = cloneAndConsume(remaining, combo, quantity)
      const tail = search(index + 1, nextRemaining)
      const savings = (combo.original_price - combo.promo_price) * quantity
      const candidate: ComboPricingSummary = {
        matchedCombos: [
          {
            combo_promotion_id: combo.id,
            name_en: combo.name_en,
            name_ar: combo.name_ar,
            quantity,
            promo_price: combo.promo_price,
            original_price: combo.original_price,
            savings,
            matched_product_ids: getMatchedProductIds(combo),
          },
          ...tail.matchedCombos,
        ],
        comboDiscount: savings + tail.comboDiscount,
        comboBundleTotal: combo.promo_price * quantity + tail.comboBundleTotal,
        comboOriginalTotal: combo.original_price * quantity + tail.comboOriginalTotal,
      }

      const candidateComboCount = candidate.matchedCombos.reduce(
        (sum, match) => sum + match.quantity,
        0
      )
      const bestComboCount = best.matchedCombos.reduce((sum, match) => sum + match.quantity, 0)

      if (
        candidate.comboDiscount > best.comboDiscount ||
        (candidate.comboDiscount === best.comboDiscount &&
          candidateComboCount > bestComboCount)
      ) {
        best = candidate
      }
    }

    memo.set(cacheKey, best)
    return best
  }

  return search(0, initialRemaining)
}
