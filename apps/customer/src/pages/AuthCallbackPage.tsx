// apps/customer/src/pages/AuthCallbackPage.tsx
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { useCartStore } from '../store/cartStore'

async function finalizeCheckoutRedirect(next: string) {
  if (next.startsWith('/track/')) {
    const orderId = next.split('/track/')[1]?.split(/[?#]/)[0]
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (orderId && session?.access_token) {
      await supabase.functions.invoke('claim-order-email', {
        body: { order_id: orderId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    }
    useCartStore.getState().clearCart()
    useSessionStore.getState().setPendingOrderId(null)
  }
}

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const syncFromAuthUser = useSessionStore((s) => s.syncFromAuthUser)

  useEffect(() => {
    let cancelled = false
    const nextRaw = searchParams.get('next') || '/menu'
    const next = nextRaw.startsWith('/') ? nextRaw : '/menu'

    const run = async () => {
      const url = new URL(window.location.href)
      /** Read before exchangeCodeForSession — the URL may change afterward. */
      const flow = url.searchParams.get('flow')

      if (url.searchParams.get('code')) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        )
        if (cancelled) return
        if (exchangeErr) {
          navigate('/login', { replace: true })
          return
        }
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (error) {
        navigate('/login', { replace: true })
        return
      }
      if (session?.user) {
        if (flow === 'signup_confirm') {
          await finalizeCheckoutRedirect(next)
          await supabase.auth.signOut()
          useSessionStore.getState().clearAuth()
          const q = new URLSearchParams()
          q.set('step', 'signin_otp')
          const em = session.user.email
          if (em) q.set('email', em)
          if (next && next !== '/menu') q.set('next', next)
          navigate(`/login?${q.toString()}`, { replace: true })
          return
        }
        syncFromAuthUser(session.user)
        await finalizeCheckoutRedirect(next)
        navigate(next, { replace: true })
        return
      }

      await new Promise((r) => setTimeout(r, 400))
      if (cancelled) return
      const {
        data: { session: retry },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (retry?.user) {
        if (flow === 'signup_confirm') {
          await finalizeCheckoutRedirect(next)
          await supabase.auth.signOut()
          useSessionStore.getState().clearAuth()
          const q = new URLSearchParams()
          q.set('step', 'signin_otp')
          const em = retry.user.email
          if (em) q.set('email', em)
          if (next && next !== '/menu') q.set('next', next)
          navigate(`/login?${q.toString()}`, { replace: true })
          return
        }
        syncFromAuthUser(retry.user)
        await finalizeCheckoutRedirect(next)
        navigate(next, { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [navigate, searchParams, syncFromAuthUser])

  return (
    <div
      style={{
        minHeight: '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-muted)',
      }}
    >
      …
    </div>
  )
}
