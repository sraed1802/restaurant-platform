// apps/customer/src/lib/cartPartitionStorage.ts
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { isNativeCustomerApp } from './nativeCustomerShell'
import { useSessionStore } from '../store/sessionStore'

const ROOT_KEY_WEB = 'rms-cart-root'
const ROOT_KEY_NATIVE = 'rms-cart-root-native'

export type CartPersistSlice = {
  items: unknown
  appliedPromotion: unknown
  appliedCombos: unknown
  deliveryFeeValue: unknown
  systemConfig: unknown
}

type CartRootV1 = {
  v: 1
  guest: CartPersistSlice
  users: Record<string, CartPersistSlice>
}

const EMPTY_SLICE: CartPersistSlice = {
  items: [],
  appliedPromotion: null,
  appliedCombos: [],
  deliveryFeeValue: undefined,
  systemConfig: { freeDeliveryEnabled: false, freeDeliveryMinOrder: 0 },
}

function rootKey(): string {
  return isNativeCustomerApp() ? ROOT_KEY_NATIVE : ROOT_KEY_WEB
}

function readRoot(): CartRootV1 {
  if (typeof localStorage === 'undefined') {
    return { v: 1, guest: { ...EMPTY_SLICE }, users: {} }
  }
  const raw = localStorage.getItem(rootKey())
  if (!raw) {
    return migrateLegacyCartIntoNewRoot({ v: 1, guest: { ...EMPTY_SLICE }, users: {} })
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { v: 1, guest: { ...EMPTY_SLICE }, users: {} }
    }
    const o = parsed as Record<string, unknown>
    if (o.v !== 1 || typeof o.guest !== 'object' || o.guest === null || typeof o.users !== 'object' || o.users === null) {
      return { v: 1, guest: { ...EMPTY_SLICE }, users: {} }
    }
    const root: CartRootV1 = {
      v: 1,
      guest: { ...EMPTY_SLICE, ...(o.guest as CartPersistSlice) },
      users: { ...(o.users as Record<string, CartPersistSlice>) },
    }
    return migrateLegacyCartIntoNewRoot(root)
  } catch {
    return { v: 1, guest: { ...EMPTY_SLICE }, users: {} }
  }
}

function writeRoot(root: CartRootV1): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(rootKey(), JSON.stringify(root))
}

/** One-time: copy flat `rms-cart` key into guest slice if root guest is empty. */
function migrateLegacyCartIntoNewRoot(root: CartRootV1): CartRootV1 {
  if (typeof localStorage === 'undefined') return root
  const guestItems = root.guest?.items
  const guestHasItems = Array.isArray(guestItems) && guestItems.length > 0
  if (guestHasItems) return root

  const legacyWeb = 'rms-cart'
  const legacyNative = 'rms-cart-native'
  const legacyKey = isNativeCustomerApp() ? legacyNative : legacyWeb
  const legacy = localStorage.getItem(legacyKey)
  if (!legacy) return root

  try {
    const parsed = JSON.parse(legacy) as { state?: CartPersistSlice }
    const slice = parsed?.state
    if (slice && typeof slice === 'object') {
      const next: CartRootV1 = {
        ...root,
        guest: {
          ...EMPTY_SLICE,
          items: slice.items ?? [],
          appliedPromotion: slice.appliedPromotion ?? null,
          appliedCombos: slice.appliedCombos ?? [],
          deliveryFeeValue: slice.deliveryFeeValue,
          systemConfig: slice.systemConfig ?? EMPTY_SLICE.systemConfig,
        },
      }
      localStorage.removeItem(legacyKey)
      writeRoot(next)
      return next
    }
  } catch {
    /* ignore */
  }
  return root
}

function partitionKey(customerId: string | null): '__guest__' | string {
  return customerId ?? '__guest__'
}

export function createCartPartitionPersistStorage(): PersistStorage<unknown> {
  return {
    getItem: async () => {
      if (typeof window === 'undefined') return null
      const customerId = useSessionStore.getState().customerId
      const root = readRoot()
      const pk = partitionKey(customerId)
      const slice = pk === '__guest__' ? root.guest : root.users[pk] ?? { ...EMPTY_SLICE }
      return { state: { ...slice }, version: 0 }
    },
    setItem: async (_name, value: StorageValue<unknown>) => {
      if (typeof window === 'undefined') return
      const customerId = useSessionStore.getState().customerId
      const pk = partitionKey(customerId)
      const root = readRoot()
      const st = value.state as unknown as CartPersistSlice
      const slice: CartPersistSlice = {
        items: st?.items ?? [],
        appliedPromotion: st?.appliedPromotion ?? null,
        appliedCombos: st?.appliedCombos ?? [],
        deliveryFeeValue: st?.deliveryFeeValue,
        systemConfig: st?.systemConfig ?? EMPTY_SLICE.systemConfig,
      }
      if (pk === '__guest__') {
        root.guest = slice
      } else {
        root.users[pk] = slice
      }
      writeRoot(root)
    },
    removeItem: async () => {
      if (typeof localStorage === 'undefined') return
      localStorage.removeItem(rootKey())
    },
  }
}

/** When a user signs in, move guest-cart lines into their partition if their saved cart is empty. */
export function mergeGuestPartitionIntoUser(userId: string): void {
  if (typeof localStorage === 'undefined') return
  const root = readRoot()
  const guest = root.guest
  const hasGuestItems = Array.isArray(guest.items) && guest.items.length > 0
  const user = root.users[userId]
  const userItems = user?.items
  const userEmpty = !Array.isArray(userItems) || userItems.length === 0
  if (!hasGuestItems || !userEmpty) return

  root.users[userId] = {
    ...EMPTY_SLICE,
    ...user,
    items: guest.items,
    appliedPromotion: guest.appliedPromotion ?? null,
    appliedCombos: guest.appliedCombos ?? [],
    deliveryFeeValue: guest.deliveryFeeValue ?? user?.deliveryFeeValue,
    systemConfig: guest.systemConfig ?? user?.systemConfig ?? EMPTY_SLICE.systemConfig,
  }
  root.guest = { ...EMPTY_SLICE }
  writeRoot(root)
}
