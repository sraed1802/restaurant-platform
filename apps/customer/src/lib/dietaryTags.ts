/** Match against `products.tags` (lowercase recommended in admin). */
export const DIETARY_FILTERS = [
  { key: 'vegetarian', en: 'Vegetarian', ar: 'نباتي' },
  { key: 'vegan', en: 'Vegan', ar: 'نباتي صرف' },
  { key: 'gluten-free', en: 'Gluten-free', ar: 'خالٍ من الغلوتين' },
  { key: 'nuts', en: 'Contains nuts', ar: 'يحتوي على مكسرات' },
  { key: 'shellfish', en: 'Shellfish', ar: 'محار وقشريات' },
] as const

export type DietaryKey = (typeof DIETARY_FILTERS)[number]['key']

/** Item matches if it carries any of the selected dietary tags (OR). */
export function productMatchesDietary(tags: string[] | undefined, selected: Set<string>): boolean {
  if (selected.size === 0) return true
  const lower = new Set((tags ?? []).map((t) => t.toLowerCase()))
  return [...selected].some((key) => lower.has(key.toLowerCase()))
}

export function dietaryBadgeLabel(tag: string, lang: 'en' | 'ar'): string {
  const found = DIETARY_FILTERS.find((f) => f.key === tag.toLowerCase())
  if (found) return lang === 'ar' ? found.ar : found.en
  return tag
}
