// apps/customer/src/native/NativeCustomerLayout.tsx
import { useLayoutEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSessionStore } from '../store/sessionStore'
import { useCartStore } from '../store/cartStore'
import { useNativeCartFeedbackStore } from '../store/nativeCartFeedbackStore'
import { CartIcon, SettingsSlidersIcon, TruckIcon, UtensilsIcon } from '../components/Icons'
import { useDynamicTheme } from '../hooks/useDynamicTheme'

export default function NativeCustomerLayout() {
  useDynamicTheme()
  const { language, setLanguage, customerId } = useSessionStore()
  const itemCount = useCartStore((s) => s.itemCount())
  const { pathname } = useLocation()
  const cartToast = useNativeCartFeedbackStore((s) => s.cartToast)
  const dismissToast = useNativeCartFeedbackStore((s) => s.dismissToast)
  const cartBump = useNativeCartFeedbackStore((s) => s.cartBump)
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  const isWelcome = pathname === '/welcome'
  const menuActive = pathname === '/' || pathname.startsWith('/menu') || pathname.startsWith('/offers')
  const cartActive = pathname.startsWith('/cart')
  const ordersActive = pathname.startsWith('/orders') || pathname.startsWith('/track')
  const accountActive =
    pathname.startsWith('/login') ||
    pathname.startsWith('/verify') ||
    pathname.startsWith('/referral') ||
    pathname.startsWith('/reviews') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/data-protection')

  const screenTitle = !isWelcome
    ? pathname.startsWith('/checkout')
      ? t('Checkout', 'الدفع')
      : pathname.startsWith('/verify')
        ? t('Verify', 'تحقق')
        : menuActive
          ? t('Menu', 'القائمة')
          : cartActive
            ? t('Cart', 'السلة')
            : ordersActive
              ? t('Orders', 'الطلبات')
              : pathname.startsWith('/privacy')
                ? t('Privacy', 'الخصوصية')
                : pathname.startsWith('/data-protection')
                  ? t('Data Protection', 'حماية البيانات')
                  : accountActive
                    ? customerId
                      ? t('More', 'المزيد')
                      : t('Sign in', 'دخول')
                    : null
    : null

  const accountTo = customerId ? '/profile' : '/login'

  useLayoutEffect(() => {
    const cls = 'rms-native-welcome-route'
    if (isWelcome) {
      document.documentElement.classList.add(cls)
      return () => document.documentElement.classList.remove(cls)
    }
    document.documentElement.classList.remove(cls)
    return undefined
  }, [isWelcome])

  return (
    <div className={`native-app-root${isWelcome ? ' native-app-root--welcome' : ''}`}>
      {!isWelcome ? (
        <header
          className={`native-app-header native-app-header--lang${screenTitle ? ' native-app-header--with-title' : ''}`}
          aria-labelledby={screenTitle ? 'native-app-screen-heading' : undefined}
        >
          {screenTitle ? (
            <span className="native-app-screen-title" id="native-app-screen-heading">
              {screenTitle}
            </span>
          ) : null}
          <div className="native-lang-toggle" role="group" aria-label={t('Language', 'اللغة')}>
            <button
              type="button"
              className={`native-lang-btn ${language === 'en' ? 'native-lang-btn--active' : ''}`}
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
            >
              English
            </button>
            <button
              type="button"
              className={`native-lang-btn ${language === 'ar' ? 'native-lang-btn--active' : ''}`}
              onClick={() => setLanguage('ar')}
              aria-pressed={language === 'ar'}
            >
              العربية
            </button>
          </div>
        </header>
      ) : null}

      <main className={`native-app-main${isWelcome ? ' native-app-main--welcome' : ''}`}>
        <Outlet />
      </main>

      {cartToast && !isWelcome ? (
        <div className="native-cart-toast" role="status" aria-live="polite">
          <span className="native-cart-toast-check" aria-hidden>
            ✓
          </span>
          <span className="native-cart-toast-text">
            {t('Added to cart', 'أُضيف إلى السلة')}: <strong>{cartToast}</strong>
          </span>
          <button type="button" className="native-cart-toast-dismiss" onClick={dismissToast} aria-label={t('Dismiss', 'إغلاق')}>
            ×
          </button>
        </div>
      ) : null}

      {!isWelcome ? (
      <nav className="native-tabbar" aria-label={t('Main navigation', 'التنقل الرئيسي')}>
        <NavLink
          to="/menu"
          className={() => (menuActive ? 'native-tab native-tab--active' : 'native-tab')}
          aria-current={menuActive ? 'page' : undefined}
        >
          <span className="native-tab-icon">
            <UtensilsIcon className="native-tab-svg" />
          </span>
          {t('Menu', 'القائمة')}
        </NavLink>
        <NavLink
          to="/cart"
          className={() => (cartActive ? 'native-tab native-tab--active' : 'native-tab')}
          aria-current={cartActive ? 'page' : undefined}
        >
          <span className="native-tab-icon native-tab-icon--with-badge" key={cartBump}>
            <CartIcon className="native-tab-svg" />
            {itemCount > 0 ? (
              <span className="native-tab-badge">{itemCount > 99 ? '99+' : itemCount}</span>
            ) : null}
          </span>
          {t('Cart', 'السلة')}
        </NavLink>
        <NavLink
          to="/orders"
          className={() => (ordersActive ? 'native-tab native-tab--active' : 'native-tab')}
          aria-current={ordersActive ? 'page' : undefined}
        >
          <span className="native-tab-icon">
            <TruckIcon className="native-tab-svg" />
          </span>
          {t('Orders', 'الطلبات')}
        </NavLink>
        <NavLink
          to={accountTo}
          className={() => (accountActive ? 'native-tab native-tab--active' : 'native-tab')}
          aria-current={accountActive ? 'page' : undefined}
        >
          <span className="native-tab-icon">
            <SettingsSlidersIcon className="native-tab-svg" />
          </span>
          {customerId ? t('More', 'المزيد') : t('Sign in', 'دخول')}
        </NavLink>
      </nav>
      ) : null}
    </div>
  )
}
