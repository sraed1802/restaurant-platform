import './index.css'
import { useEffect, useState, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { fetchPublicRestaurantBranding, type PublicRestaurantBranding } from './lib/publicRestaurantBranding'
import LoginPage from './pages/LoginPage'
import DriverInboxPage from './pages/DriverInboxPage'

function DriverBootLoading({ branding }: { branding: PublicRestaurantBranding | undefined }) {
  const logoUrl =
    branding?.driver_shell_logo_url || branding?.loading_logo_url || branding?.welcome_logo_url || branding?.logo_url
  const accent = branding?.primary_color
  const title = branding?.restaurant_name_en || 'Driver'
  const sub = branding?.native_loading_text_en?.trim() || 'Checking driver session…'

  return (
    <div className="driver-loading">
      {logoUrl ? (
        <img src={logoUrl} alt="" width={64} height={64} style={{ objectFit: 'contain', marginBottom: '0.75rem' }} />
      ) : null}
      <div className="driver-spinner" style={accent ? { borderTopColor: accent } : undefined} />
      <p style={{ fontWeight: 700, margin: '0.35rem 0 0' }}>{title}</p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', opacity: 0.85 }}>{sub}</p>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const location = useLocation()
  const superAppPrefix = useMemo(() => {
    const p = location.pathname
    return p === '/driver' || p.startsWith('/driver/') ? '/driver' : ''
  }, [location.pathname])
  const routePath = useCallback(
    (path: string) => (superAppPrefix ? `${superAppPrefix}${path}` : path),
    [superAppPrefix],
  )

  const brandingQuery = useQuery({
    queryKey: ['public_restaurant_branding'],
    queryFn: fetchPublicRestaurantBranding,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (typeof user === 'undefined') {
    return <DriverBootLoading branding={brandingQuery.data} />
  }

  return (
    <div className="rms-driver-super-root">
      <Routes>
        <Route
          index
          element={<Navigate to={user ? routePath('/inbox') : routePath('/login')} replace />}
        />
        <Route path={routePath('/login')} element={user ? <Navigate to={routePath('/inbox')} replace /> : <LoginPage />} />
        <Route
          path={routePath('/inbox')}
          element={
            user ? <DriverInboxPage userEmail={user.email} onSignOut={signOut} /> : <Navigate to={routePath('/login')} replace />
          }
        />
        <Route path="*" element={<Navigate to={user ? routePath('/inbox') : routePath('/login')} replace />} />
      </Routes>
    </div>
  )
}
