import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { isNativeCustomerApp } from './nativeCustomerShell'

/**
 * Reads native vs web on every storage access so keys stay correct if the Capacitor
 * bridge attaches after the first store module evaluation.
 */
function persistLocalKey(webKey: string, nativeKey: string): string {
  return isNativeCustomerApp() ? nativeKey : webKey
}

function parsePersisted<Value>(raw: unknown): StorageValue<Value> | null {
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if ('state' in o) {
    return raw as StorageValue<Value>
  }
  return { state: raw as Value }
}

export function createCustomerJsonPersistStorage<Value>(
  webKey: string,
  nativeKey: string,
): PersistStorage<Value> {
  const key = () => persistLocalKey(webKey, nativeKey)
  return {
    getItem: async (_name) => {
      if (typeof localStorage === 'undefined') return null
      const str = localStorage.getItem(key())
      if (str == null) return null
      try {
        return parsePersisted<Value>(JSON.parse(str) as unknown)
      } catch {
        return null
      }
    },
    setItem: async (_name, value) => {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(key(), JSON.stringify(value))
    },
    removeItem: async (_name) => {
      if (typeof localStorage === 'undefined') return
      localStorage.removeItem(key())
    },
  }
}
