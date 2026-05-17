import { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'

/**
 * Zustand `persist` rehydrates asynchronously. Before hydration, `customerId` etc. match
 * store defaults — guards must wait or they falsely redirect to login on cold start (incl. app relaunch).
 */
export function useSessionStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useSessionStore.persist.hasHydrated())

  useEffect(() => {
    if (useSessionStore.persist.hasHydrated()) {
      setHydrated(true)
      return
    }
    return useSessionStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })
  }, [])

  return hydrated
}
