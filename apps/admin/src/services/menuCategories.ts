import { supabase } from '../lib/supabase'
import { asMutationArg } from '../lib/supabaseTypeWorkarounds'

export function reorderCategoriesById<T extends { id: string }>(
  items: T[],
  dragId: string,
  hoverId: string,
): T[] {
  const from = items.findIndex((item) => item.id === dragId)
  const to = items.findIndex((item) => item.id === hoverId)
  if (from === -1 || to === -1 || from === to) return items

  const next = [...items]
  const [removed] = next.splice(from, 1)
  next.splice(to, 0, removed)
  return next
}

/** Persists category order for the guest menu (0 = first category shown). */
export async function persistCategoryDisplayOrder(
  orderedIds: string[],
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, display_order) =>
      supabase.from('categories').update(asMutationArg({ display_order })).eq('id', id),
    ),
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    throw failed.error
  }
}
