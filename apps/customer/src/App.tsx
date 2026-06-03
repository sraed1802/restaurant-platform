import { Suspense, lazy, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { App as CapApp } from '@capacitor/app'
import { useTenantScope } from '@rms/platform'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useSessionStore } from './store/sessionStore'
import { useCartStore } from './store/cartStore'
import EnhancedLayout from './components/EnhancedLayout'
import NativeCustomerLayout from './native/NativeCustomerLayout'
import ThemeToggle from './components/ThemeToggle'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import { NativeCustomerLoading } from './components/NativeCustomerLoading'
import { ErrorBoundary } from './components/ErrorBoundary'
import { isAdminEmbedPreview } from './lib/embedPreview'
import { isNativeCustomerApp } from './lib/nativeCustomerShell'
import { useDocumentMeta } from './hooks/useDocumentMeta'
import { useAuthSync } from './hooks/useAuthSync'
import { syncSentryContext } from './lib/sentry'
import { dispatchCustomerAppUrlOpen } from './lib/openOperatorApp'

/** Separate lazy roots so we can switch native vs web when `nativeShell` resolves without remounting all routes. */
const NativeMenuPage = lazy(() => import('./native/NativeMenuPage'))
const WebMenuPage = lazy(() => import('./pages/MenuPage'))
const NativeCartPage = lazy(() => import('./native/NativeCartPage'))
const WebCartPage = lazy(() => import('./pages/CartPage'))

const NativeStartPage = lazy(() => import('./native/NativeStartPage'))
import NativeIndexRedirect from './native/NativeIndexRedirect'

const CheckoutPage = lazy(() => import('./pages/CheckoutPage'))
const TrackPage = lazy(() => import('./pages/TrackPage'))
const OtpPage = lazy(() => import('./pages/OtpPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const ReferralPage = lazy(() => import('./pages/ReferralPage'))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))
const DataProtectionPage = lazy(() => import('./pages/DataProtectionPage'))
const OffersPage = lazy(() => import('./pages/OffersPage'))

function NativeRouteBody({ children }: { children: ReactNode }) {
  return <div className="native-screen native-screen-generic">{children}</div>
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const tenantScope = useTenantScope()
  const { language, initSession, customerId, customerEmail } = useSessionStore()
  const [nativeShell, setNativeShell] = useState(() => isNativeCustomerApp())

  useLayoutEffect(() => {
    setNativeShell(isNativeCustomerApp())
  }, [])

  useEffect(() => {
    if (nativeShell) return
    const timer = window.setTimeout(() => {
      setNativeShell(isNativeCustomerApp())
    }, 80)
    return () => window.clearTimeout(timer)
  }, [nativeShell])
  useDocumentMeta(language)
  useAuthSync()

  /** Supabase puts auth failures in the URL hash, e.g. #error=access_denied&error_code=otp_expired */
  useEffect(() => {
    const raw = window.location.hash?.replace(/^#/, '')
    if (!raw) return
    const params = new URLSearchParams(raw)
    if (!params.get('error') && !params.get('error_code')) return

    const errorCode = params.get('error_code') || params.get('error') || 'unknown'
    const errorDesc = params.get('error_description') || ''
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    )

    const q = new URLSearchParams()
    q.set('auth_error', errorCode)
    if (errorDesc) q.set('auth_msg', errorDesc)
    navigate(`/login?${q.toString()}`, { replace: true })
  }, [navigate])

  useEffect(() => {
    initSession()
  }, [])

  useEffect(() => {
    const sub = CapApp.addListener('appUrlOpen', (data: { url: string }) => {
      try {
        if (dispatchCustomerAppUrlOpen(data.url)) return
      } catch (err) {
        console.error('Deep link handling failed', err)
      }
    })
    return () => {
      void sub.then((s: { remove: () => Promise<void> }) => s.remove())
    }
  }, [])

  useEffect(() => {
    void useCartStore.persist.rehydrate()
  }, [customerId])

  useEffect(() => {
    syncSentryContext({
      surface: 'customer',
      pathname: location.pathname,
      tenantScope,
      user: {
        id: customerId,
        email: customerEmail,
      },
    })
  }, [customerEmail, customerId, location.pathname, tenantScope])

  const routeFallback = nativeShell ? (
    <NativeCustomerLoading variant="route" />
  ) : (
    <div
      style={{
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-muted)',
        fontSize: '0.9rem',
      }}
    >
      …
    </div>
  )

  function lazyRoute(element: ReactNode) {
    return <Suspense fallback={routeFallback}>{element}</Suspense>
  }

  function wrapNative(element: ReactNode) {
    if (!nativeShell) return element
    return <NativeRouteBody>{element}</NativeRouteBody>
  }

  return (
    <ErrorBoundary>
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
        <Routes>
          <Route element={nativeShell ? <NativeCustomerLayout /> : <EnhancedLayout />}>
            <Route
              index
              element={nativeShell ? <NativeIndexRedirect /> : <Navigate to="/menu" replace />}
            />
            <Route
              path="/welcome"
              element={nativeShell ? lazyRoute(<NativeStartPage />) : <Navigate to="/menu" replace />}
            />
            <Route
              path="/menu"
              element={lazyRoute(nativeShell ? <NativeMenuPage /> : <WebMenuPage />)}
            />
            <Route path="/offers" element={lazyRoute(wrapNative(<OffersPage />))} />
            <Route
              path="/cart"
              element={lazyRoute(nativeShell ? <NativeCartPage /> : <WebCartPage />)}
            />
            <Route path="/checkout" element={lazyRoute(wrapNative(<CheckoutPage />))} />
            <Route path="/verify" element={lazyRoute(wrapNative(<OtpPage />))} />
            <Route path="/login" element={lazyRoute(wrapNative(<LoginPage />))} />
            <Route path="/auth/callback" element={lazyRoute(wrapNative(<AuthCallbackPage />))} />
            <Route path="/orders" element={lazyRoute(wrapNative(<OrdersPage />))} />
            <Route path="/track/:orderId" element={lazyRoute(wrapNative(<TrackPage />))} />
            <Route path="/referral" element={lazyRoute(wrapNative(<ReferralPage />))} />
            <Route path="/reviews" element={lazyRoute(wrapNative(<ReviewsPage />))} />
            <Route path="/profile" element={lazyRoute(wrapNative(<ProfilePage />))} />
            <Route path="/privacy" element={lazyRoute(wrapNative(<PrivacyPolicyPage />))} />
            <Route path="/data-protection" element={lazyRoute(wrapNative(<DataProtectionPage />))} />
          </Route>
        </Routes>
        {!nativeShell && !isAdminEmbedPreview() ? <ThemeToggle /> : null}
        {!nativeShell && !isAdminEmbedPreview() ? <PWAInstallPrompt /> : null}
      </div>
    </ErrorBoundary>
  )
}
