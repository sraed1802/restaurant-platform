// apps/admin/src/App.tsx
import './index.css'
import { useEffect, useMemo, useRef, useState, lazy, Suspense, useCallback } from 'react'
import { fireNativeAlert, requestNativeNotificationPermission, useTenantScope } from '@rms/platform'
import { isNativeAdminApp } from './lib/nativeAdminShell'
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import { ErrorBoundary } from './components/ErrorBoundary'
import Toast from './components/Toast'
import { asMaybeRow, asRows } from './lib/supabaseTypeWorkarounds'
import { syncSentryContext } from './lib/sentry'
import { useQuery } from '@tanstack/react-query'
import { fetchPublicRestaurantBranding, type PublicRestaurantBranding } from './lib/publicRestaurantBranding'

// Lazy load pages for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const DriversPage = lazy(() => import('./pages/DriversPage'))
const MenuEditorPage = lazy(() => import('./pages/MenuEditorPage'))
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'))
const ComboPromotionsPage = lazy(() => import('./pages/ComboPromotionsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const CustomerAnalyticsPage = lazy(() => import('./pages/CustomerAnalyticsPage'))
const CustomersCrmPage = lazy(() => import('./pages/CustomersCrmPage'))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))

type StaffRole = 'admin' | 'manager' | 'supervisor'

type NavItem = { to: string; label: string; icon: string; roles?: readonly StaffRole[] }

const ALL_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '◈' },
  { to: '/orders', label: 'Orders', icon: '◫' },
  { to: '/drivers', label: 'Drivers', icon: '◬' },
  { to: '/menu', label: 'Menu', icon: '◧' },
  { to: '/promotions', label: 'Promotions', icon: '◉' },
  { to: '/promotions/combos', label: 'Combos', icon: '⬢' },
  { to: '/analytics', label: 'Analytics', icon: '◰' },
  { to: '/crm/customers', label: 'CRM', icon: '◎' },
  { to: '/reviews', label: 'Reviews', icon: '★' },
  { to: '/customer-analytics', label: 'Analytics (Customers)', icon: '◷' },
  { to: '/staff', label: 'Staff', icon: '⚇', roles: ['admin', 'manager'] },
  { to: '/inventory', label: 'Inventory', icon: '⚖' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

interface StaffProfile {
  app_role: StaffRole
  is_active: boolean
}

interface OperatorNotificationRow {
  id: string
  title: string
  message: string
  event_type: string
}

interface OperatorToastState {
  id: string
  title: string
  message: string
  type: 'info' | 'error'
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const navigate = useNavigate()
  const location = useLocation()
  const tenantScope = useTenantScope()
  const superAppPrefix = useMemo(() => {
    const p = location.pathname
    return p === '/admin' || p.startsWith('/admin/') ? '/admin' : ''
  }, [location.pathname])
  const routePath = useCallback(
    (path: string) => (superAppPrefix ? `${superAppPrefix}${path}` : path),
    [superAppPrefix],
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null)
  const [operatorToasts, setOperatorToasts] = useState<OperatorToastState[]>([])
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installingApp, setInstallingApp] = useState(false)
  const [appInstalled, setAppInstalled] = useState(false)
  const seenOperatorNotificationIds = useRef<Set<string>>(new Set())

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
      if (session) return
      const loginPath = routePath('/login')
      const path = window.location.pathname
      if (path !== loginPath && !path.startsWith(`${loginPath}/`)) {
        navigate(loginPath, { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate, routePath])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    syncSentryContext({
      surface: 'admin',
      pathname: location.pathname,
      tenantScope,
      user: {
        id: user?.id ?? null,
        email: user?.email ?? null,
        role: staffProfile?.app_role ?? null,
      },
    })
  }, [location.pathname, staffProfile?.app_role, tenantScope, user?.email, user?.id])

  useEffect(() => {
    if (!mobileNavOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)')

    const syncInstalledState = () => {
      const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
      setAppInstalled(mediaQuery.matches || navigatorWithStandalone.standalone === true)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
      syncInstalledState()
    }

    const handleAppInstalled = () => {
      setAppInstalled(true)
      setInstallPromptEvent(null)
      setInstallingApp(false)
    }

    syncInstalledState()

    mediaQuery.addEventListener('change', syncInstalledState)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      mediaQuery.removeEventListener('change', syncInstalledState)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function handleInstallApp() {
    if (!installPromptEvent || installingApp) return

    setInstallingApp(true)

    try {
      await installPromptEvent.prompt()
      const choice = await installPromptEvent.userChoice
      if (choice.outcome === 'accepted') {
        setInstallPromptEvent(null)
      }
    } catch (error) {
      console.error('Failed to show install prompt:', error)
    } finally {
      setInstallingApp(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setStaffProfile(null)
      return
    }

    let cancelled = false

    supabase
      .from('staff')
      .select('app_role, is_active')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load current staff profile:', error)
          return
        }
        const staffRow = asMaybeRow<{ app_role: StaffRole; is_active: boolean }>(data)
        setStaffProfile(staffRow ? { app_role: staffRow.app_role, is_active: staffRow.is_active } : null)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (isNativeAdminApp()) {
      void requestNativeNotificationPermission()
    }
  }, [])

  useEffect(() => {
    if (!user || !staffProfile?.is_active || !['admin', 'manager', 'supervisor'].includes(staffProfile.app_role)) {
      return
    }

    let cancelled = false
    seenOperatorNotificationIds.current = new Set()

    supabase
      .from('operator_notifications')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to seed operator notification IDs:', error)
          return
        }

        for (const row of asRows<{ id: string }>(data)) {
          if (typeof row.id === 'string') {
            seenOperatorNotificationIds.current.add(row.id)
          }
        }
      })

    const channel = supabase
      .channel(`admin:operator-notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'operator_notifications' },
        (payload) => {
          const row = payload.new as OperatorNotificationRow
          if (!row?.id || seenOperatorNotificationIds.current.has(row.id)) {
            return
          }

          seenOperatorNotificationIds.current.add(row.id)
          const toastType: OperatorToastState['type'] =
            row.event_type === 'order.cancelled' ? 'error' : 'info'
          const toastEntry = {
            id: row.id,
            title: row.title,
            message: row.message,
            type: toastType,
          }
          fireNativeAlert({
            id: row.id,
            title: row.title,
            message: row.message,
            tone: row.event_type === 'order.cancelled' ? 'error' : 'info',
            tag: `ops-${row.id}`,
          })
          setOperatorToasts((current) => [...current, toastEntry].slice(-4))
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      channel.unsubscribe()
    }
  }, [user?.id, staffProfile?.app_role, staffProfile?.is_active])

  const resolvedNavRole: StaffRole = useMemo(() => {
    if (staffProfile?.app_role) return staffProfile.app_role
    const m = user?.app_metadata?.role
    if (m === 'admin' || m === 'manager' || m === 'supervisor') return m
    return 'supervisor'
  }, [staffProfile?.app_role, user?.app_metadata?.role])

  const navItems = useMemo(
    () =>
      ALL_NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(resolvedNavRole)).map((item) => ({
        ...item,
        to: routePath(item.to),
      })),
    [resolvedNavRole, routePath],
  )

  const activeNav = useMemo(
    () =>
      navItems.reduce<NavItem | null>((best, item) => {
        const matches = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
        if (!matches) return best
        if (!best || item.to.length > best.to.length) return item
        return best
      }, null),
    [navItems, location.pathname]
  )

  if (user === undefined) return <AdminBootLoading branding={brandingQuery.data} />

  if (!user) return (
    <div className={superAppPrefix ? 'rms-admin-super-root' : undefined}>
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route index element={<Navigate to={routePath('/login')} replace />} />
            <Route path={routePath('/login')} element={<LoginPage />} />
            <Route path="*" element={<Navigate to={routePath('/login')} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  )

  const canInstallApp = Boolean(installPromptEvent) && !appInstalled

  return (
    <div className={superAppPrefix ? 'rms-admin-super-root' : undefined}>
    <ErrorBoundary>
      <div className={`admin-shell ${mobileNavOpen ? 'nav-open' : ''}`}>
        <div className="admin-mobile-bar">
          <button
            type="button"
            className="mobile-nav-trigger"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            aria-controls="admin-sidebar"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="admin-mobile-brand">
            <p className="admin-mobile-label">
              {(brandingQuery.data?.restaurant_name_en || 'Admin').length > 22
                ? `${(brandingQuery.data?.restaurant_name_en || 'Admin').slice(0, 20)}…`
                : brandingQuery.data?.restaurant_name_en || 'Admin'}
            </p>
            <p className="admin-mobile-route">{activeNav?.label ?? 'Dashboard'}</p>
          </div>
          {canInstallApp && (
            <button
              type="button"
              className="mobile-install-btn"
              onClick={() => {
                void handleInstallApp()
              }}
              disabled={installingApp}
            >
              {installingApp ? 'Installing…' : 'Install app'}
            </button>
          )}
        </div>

        {mobileNavOpen && (
          <button
            type="button"
            className="mobile-nav-backdrop"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <Sidebar
          shellBranding={brandingQuery.data}
          user={user}
          navItems={navItems}
          staffRole={staffProfile?.app_role ?? (user.app_metadata?.role as string | undefined) ?? 'supervisor'}
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          canInstallApp={canInstallApp}
          installingApp={installingApp}
          onInstallApp={() => {
            void handleInstallApp()
          }}
        />
        <main className="admin-main">
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route index element={<Navigate to={routePath('/dashboard')} replace />} />
              <Route
                path={routePath('/dashboard')}
                element={<DashboardPage staffRole={staffProfile?.app_role ?? null} />}
              />
              <Route path={routePath('/orders')} element={<OrdersPage />} />
              <Route path={routePath('/drivers')} element={<DriversPage />} />
              <Route path={routePath('/menu')} element={<MenuEditorPage staffRole={staffProfile?.app_role ?? null} />} />
              <Route path={routePath('/promotions')} element={<PromotionsPage />} />
              <Route path={routePath('/promotions/combos')} element={<ComboPromotionsPage />} />
              <Route path={routePath('/analytics')} element={<AnalyticsPage />} />
              <Route path={routePath('/customer-analytics')} element={<CustomerAnalyticsPage />} />
              <Route path={routePath('/crm/customers')} element={<CustomersCrmPage />} />
              <Route path={routePath('/reviews')} element={<ReviewsPage />} />
              <Route
                path={routePath('/staff')}
                element={
                  staffProfile && ['admin', 'manager'].includes(staffProfile.app_role) ? (
                    <StaffPage viewerRole={staffProfile.app_role as 'admin' | 'manager'} />
                  ) : (
                    <Navigate to={routePath('/dashboard')} replace />
                  )
                }
              />
              <Route path={routePath('/inventory')} element={<InventoryPage />} />
              <Route path={routePath('/settings')} element={<SettingsPage staffRole={staffProfile?.app_role ?? null} />} />
              <Route path="*" element={<Navigate to={routePath('/dashboard')} replace />} />
            </Routes>
          </Suspense>
        </main>

        {operatorToasts.map((toast, index) => (
          <Toast
            key={toast.id}
            title={toast.title}
            message={toast.message}
            type={toast.type}
            duration={5000}
            onClose={() =>
              setOperatorToasts((current) => current.filter((entry) => entry.id !== toast.id))
            }
            style={{
              right: '1rem',
              bottom: `${1 + index * 5.5}rem`,
            }}
          />
        ))}

        <style>{`
          .admin-shell {
            display: flex;
            min-height: 100dvh;
            position: relative;
            background: var(--bg);
          }
          .admin-main {
            flex: 1;
            overflow-y: auto;
            padding: 1.75rem 2.25rem 2.5rem;
            min-width: 0;
            border-radius: 20px 0 0 0;
            margin-top: 0.5rem;
            margin-inline-end: 0.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(165deg, rgba(20, 25, 37, 0.65) 0%, var(--bg) 28%);
            border: 1px solid var(--border);
            box-shadow: -6px 0 40px rgba(0, 0, 0, 0.2);
          }

          .admin-mobile-bar,
          .mobile-nav-backdrop {
            display: none;
          }

          @media (max-width: 900px) {
            .admin-shell {
              display: block;
            }

            .admin-mobile-bar {
              display: flex;
              align-items: center;
              gap: 0.9rem;
              position: sticky;
              top: 0;
              z-index: 260;
              padding: 0.8rem 0.9rem;
              background: linear-gradient(180deg, rgba(20, 25, 37, 0.96), rgba(13, 18, 28, 0.92));
              border-bottom: 1px solid var(--border);
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
            }

            .mobile-nav-trigger {
              width: 44px;
              height: 44px;
              border-radius: 12px;
              border: 1px solid var(--border-2);
              background: var(--bg-2);
              display: inline-flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 4px;
              flex-shrink: 0;
            }

            .mobile-nav-trigger span {
              width: 16px;
              height: 2px;
              border-radius: 999px;
              background: var(--text);
            }

            .admin-mobile-brand {
              min-width: 0;
            }

            .admin-mobile-label {
              font-size: 0.62rem;
              font-weight: 700;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              color: var(--text-muted);
            }

            .admin-mobile-route {
              font-size: 0.98rem;
              font-weight: 700;
              color: var(--text);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .mobile-install-btn {
              margin-left: auto;
              min-height: 38px;
              padding: 0.55rem 0.8rem;
              border-radius: 10px;
              background: linear-gradient(135deg, var(--gold), #d4a03a);
              color: #1a0900;
              font-size: 0.72rem;
              font-weight: 800;
              letter-spacing: 0.04em;
              white-space: nowrap;
              box-shadow: 0 8px 18px rgba(230, 184, 74, 0.18);
            }

            .mobile-install-btn:disabled {
              opacity: 0.6;
            }

            .mobile-nav-backdrop {
              display: block;
              position: fixed;
              inset: 0;
              z-index: 295;
              background: rgba(2, 6, 12, 0.6);
              border: none;
            }

            .admin-main {
              padding: 1rem 0.9rem 1.5rem;
              border-radius: 0;
              margin: 0;
              box-shadow: none;
              border: none;
              background: var(--bg);
            }
          }

          @media (max-width: 480px) {
            .admin-main {
              padding-inline: 0.75rem;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
    </div>
  )
}

function AdminBootLoading({ branding }: { branding: PublicRestaurantBranding | undefined }) {
  const logoUrl = branding?.loading_logo_url || branding?.logo_url
  const accent = branding?.primary_color || undefined
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        background: 'var(--bg)',
        gap: '1rem',
        padding: '1.5rem',
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          style={{ maxWidth: 160, maxHeight: 72, objectFit: 'contain' }}
          decoding="async"
        />
      ) : null}
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--border-2)',
          borderTopColor: accent || 'var(--gold)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>
    </div>
  )
}

function Sidebar({
  shellBranding,
  user,
  navItems,
  staffRole,
  mobileOpen,
  onClose,
  canInstallApp,
  installingApp,
  onInstallApp,
}: {
  shellBranding: PublicRestaurantBranding | undefined
  user: User
  navItems: NavItem[]
  staffRole: string
  mobileOpen: boolean
  onClose: () => void
  canInstallApp: boolean
  installingApp: boolean
  onInstallApp: () => void
}) {
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'dispatched'])
      .then(({ count }) => setLiveCount(count ?? 0))

    const channel = supabase
      .channel('admin:orders:sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'dispatched'])
          .then(({ count }) => setLiveCount(count ?? 0))
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  const shellLogoUrl = shellBranding?.admin_shell_logo_url || shellBranding?.logo_url
  const shellTitle = (shellBranding?.restaurant_name_en || 'Ops Center').toUpperCase()
  const shellSub = shellBranding?.restaurant_tagline_en || 'Restaurant Intelligence'

  return (
    <aside id="admin-sidebar" className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">
        {shellLogoUrl ? (
          <img
            src={shellLogoUrl}
            alt=""
            className="sidebar-logo-img"
            width={40}
            height={40}
            decoding="async"
          />
        ) : (
          <span className="sidebar-logo">▣</span>
        )}
        <div className="sidebar-brand-copy">
          <p className="sidebar-name">{shellTitle}</p>
          <p className="sidebar-sub">{shellSub}</p>
        </div>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close navigation">
          ✕
        </button>
      </div>

      {liveCount > 0 && (
        <div className="live-banner">
          <span className="live-dot" style={{ flexShrink: 0 }} />
          <span>{liveCount} active order{liveCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      <nav className="sidebar-nav">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
            {to === '/orders' && liveCount > 0 && (
              <span className="nav-badge">{liveCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {canInstallApp && (
          <button type="button" className="install-app-btn" onClick={onInstallApp} disabled={installingApp}>
            <span className="install-app-icon">⇩</span>
            <span>{installingApp ? 'Installing…' : 'Install app'}</span>
          </button>
        )}
        <div className="sidebar-user">
          <div className="user-avatar">
            {(user.email ?? user.phone ?? '?')[0].toUpperCase()}
          </div>
          <div className="user-info">
            <p className="user-email" title={user.email ?? user.phone ?? ''}>
              {user.email ?? user.phone ?? 'Staff'}
            </p>
            <p className="user-role">{staffRole}</p>
          </div>
        </div>
        <button className="signout-btn" onClick={signOut} title="Sign out">⏻</button>
      </div>

      <style>{`
        .sidebar {
          width: 244px; flex-shrink: 0;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg) 100%);
          border-right: 1px solid var(--border);
          display: flex; flex-direction: column;
          position: sticky; top: 0; height: 100dvh;
          overflow-y: auto;
          box-shadow: 8px 0 32px rgba(0, 0, 0, 0.25);
        }
        .sidebar-brand {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 1.35rem 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(90deg, rgba(230, 184, 74, 0.12), transparent 65%);
        }
        .sidebar-brand-copy { min-width: 0; flex: 1; }
        .sidebar-logo { font-size: 1.4rem; color: var(--gold); flex-shrink: 0; }
        .sidebar-logo-img {
          width: 40px;
          height: 40px;
          object-fit: contain;
          flex-shrink: 0;
          border-radius: 8px;
        }
        .sidebar-name { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; color: var(--text); }
        .sidebar-sub { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.06em; }
        .sidebar-close {
          display: none;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          color: var(--text-muted);
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .live-banner {
          display: flex; align-items: center; gap: 0.5rem;
          margin: 0.75rem; padding: 0.5rem 0.75rem;
          background: var(--green-dim); border: 1px solid rgba(34,197,94,0.2);
          border-radius: 6px; font-size: 0.72rem; font-weight: 600; color: var(--green);
        }
        .sidebar-nav { flex: 1; padding: 0.75rem 0.5rem; display: flex; flex-direction: column; gap: 2px; }
        .nav-item {
          display: flex; align-items: center; gap: 0.7rem;
          padding: 0.6rem 0.75rem; border-radius: 8px;
          font-size: 0.82rem; font-weight: 500; color: var(--text-soft);
          transition: all var(--transition);
        }
        .nav-item:hover { background: var(--bg-3); color: var(--text); }
        .nav-item.active {
          background: linear-gradient(90deg, rgba(230, 184, 74, 0.18), rgba(22, 28, 42, 0.4));
          color: var(--text);
          border-inline-start: 4px solid var(--gold);
          font-weight: 600;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .nav-icon { font-size: 1rem; flex-shrink: 0; }
        .nav-badge {
          margin-left: auto; min-width: 18px; height: 18px; padding: 0 4px;
          background: var(--amber); color: #1a0900;
          border-radius: 9px; font-size: 0.62rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }
        .sidebar-footer {
          padding: 0.75rem; border-top: 1px solid var(--border);
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
        }
        .install-app-btn {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 38px;
          margin-bottom: 0.2rem;
          padding: 0.55rem 0.8rem;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(230,184,74,0.22), rgba(230,184,74,0.12));
          border: 1px solid rgba(230,184,74,0.3);
          color: var(--gold);
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          transition: all var(--transition);
        }
        .install-app-btn:hover {
          border-color: rgba(230,184,74,0.48);
          background: linear-gradient(135deg, rgba(230,184,74,0.28), rgba(230,184,74,0.16));
          color: #f4cf74;
        }
        .install-app-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .install-app-icon {
          font-size: 0.9rem;
        }
        .sidebar-user { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }
        .user-avatar {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          background: var(--blue-dim); border: 1px solid var(--blue);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700; color: var(--blue);
        }
        .user-info { min-width: 0; }
        .user-email { font-size: 0.7rem; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-role { font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
        .signout-btn { width: 28px; height: 28px; border-radius: 6px; color: var(--text-muted); font-size: 1rem; display: flex; align-items: center; justify-content: center; }
        .signout-btn:hover { color: var(--red); background: var(--red-dim); }
        @media (max-width: 900px) {
          .sidebar {
            position: fixed;
            inset: 0 auto 0 0;
            width: min(86vw, 320px);
            height: 100dvh;
            z-index: 320;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 18px 0 40px rgba(0, 0, 0, 0.36);
          }
          .sidebar.open { transform: translateX(0); }
          .sidebar-close { display: inline-flex; }
          .sidebar-nav {
            padding: 0.9rem 0.75rem;
            gap: 0.35rem;
            overflow-y: auto;
          }
          .nav-item {
            padding: 0.8rem 0.85rem;
            font-size: 0.88rem;
          }
          .nav-icon {
            width: 1.15rem;
            text-align: center;
          }
          .sidebar-footer {
            padding-bottom: calc(0.85rem + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </aside>
  )
}

function LoadingScreen() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh', background:'var(--bg)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border-2)', borderTopColor:'var(--gold)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    </div>
  )
}
