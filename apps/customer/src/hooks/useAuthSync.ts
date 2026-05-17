// apps/customer/src/hooks/useAuthSync.ts
import { useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { useCartStore } from '../store/cartStore'
import { mergeGuestPartitionIntoUser } from '../lib/cartPartitionStorage'
import { fetchCustomerProfileRow } from '../services/customerProfile'

/** Keeps Zustand session fields aligned with Supabase Auth (email magic link / OTP). */
export function useAuthSync() {
  useEffect(() => {
    let mounted = true
    let subscription: { unsubscribe: () => void } | undefined

    async function onUserSignedIn(user: User) {
      mergeGuestPartitionIntoUser(user.id)
      useSessionStore.getState().syncFromAuthUser(user)
      await useCartStore.persist.rehydrate()
      await supabase.rpc('ensure_customer_profile')
      const row = await fetchCustomerProfileRow(user.id)
      if (row && mounted) {
        useSessionStore.getState().applyCustomerProfileRow(row)
      }
    }

    void (async () => {
      // Restore persisted UI session first so we never clear auth before rehydration
      // (otherwise `clearAuth` can be overwritten by a late persist merge).
      await useSessionStore.persist.rehydrate()
      if (!mounted) return

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return

      if (session?.user) {
        await onUserSignedIn(session.user)
      } else {
        useSessionStore.getState().clearAuth()
      }

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) return
        if (nextSession?.user) {
          if (event === 'TOKEN_REFRESHED') {
            useSessionStore.getState().syncFromAuthUser(nextSession.user)
            return
          }
          void onUserSignedIn(nextSession.user)
          return
        }
        if (event === 'SIGNED_OUT') {
          useSessionStore.getState().clearAuth()
          return
        }
        if (event === 'INITIAL_SESSION' && !nextSession?.user) {
          useSessionStore.getState().clearAuth()
        }
      })
      subscription = sub
    })()

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])
}
