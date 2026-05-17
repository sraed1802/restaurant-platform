import type { ModifierGroup, ModifierOption, Product } from '../../../types'

export type ProductWithModifiers = Product & {
  modifier_groups?: (ModifierGroup & { options: ModifierOption[] })[]
}
