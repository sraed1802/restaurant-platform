import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useSessionStore } from '../store/sessionStore'
import { useRestaurantSettings } from '../hooks/useRestaurantSettings'
import { useOrderAvailability } from '../hooks/useOrderAvailability'
import { useDynamicTheme } from '../hooks/useDynamicTheme'
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { isNativeCustomerApp } from '../lib/nativeCustomerShell'
import { useActiveOrderProgress } from '../hooks/useActiveOrderProgress'
import OrderProgressBanner from './OrderProgressBanner'
import {
  CartIcon,
  FacebookIcon,
  InstagramIcon,
  MailIcon,
  MapPinIcon,
  MenuIcon,
  UserCircleIcon,
  PhoneIcon,
  TruckIcon,
  TwitterIcon,
  UtensilsIcon,
  WhatsAppIcon,
} from './Icons'

export default function EnhancedLayout() {
  const itemCount = useCartStore((s) => s.itemCount())
  const { language, setLanguage, customerId, customerName, customerEmail } = useSessionStore()
  const { settings: restaurantSettings } = useRestaurantSettings()
  const { status: orderAvailabilityStatus } = useOrderAvailability()
  const navigate = useNavigate()
  const location = useLocation()
  const isTrackPage = location.pathname.startsWith('/track')
  const { order: activeOrder, isCancelled: activeOrderCancelled } = useActiveOrderProgress()
  const showOrderProgressBanner = Boolean(activeOrder) && !isTrackPage
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountWrapRef = useRef<HTMLDivElement>(null)

  const accountInitial = useMemo(() => {
    const n = customerName?.trim()
    if (n) {
      const parts = n.split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)).toUpperCase()
      }
      return n.slice(0, 1).toUpperCase()
    }
    const e = customerEmail?.trim()
    if (e) return e.slice(0, 1).toUpperCase()
    return '?'
  }, [customerName, customerEmail])
  const orderAvailabilityMessage = language === 'ar'
    ? (orderAvailabilityStatus.public_message_ar || 'الطلبات مغلقة حالياً.')
    : (orderAvailabilityStatus.public_message_en || 'Orders are currently closed.')
  const nextOpenLabel = orderAvailabilityStatus.next_open_at
    ? new Date(orderAvailabilityStatus.next_open_at).toLocaleString(language === 'ar' ? 'ar-QA' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null

  useEffect(() => {
    setMobileMenuOpen(false)
    setAccountMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!accountMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (accountWrapRef.current && !accountWrapRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [accountMenuOpen])

  useEffect(() => {
    if (!accountMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [accountMenuOpen])

  /** Warm heavy web route chunks after first paint (menu is default; cart/checkout are common next steps). */
  useEffect(() => {
    if (isNativeCustomerApp()) return
    const run = () => {
      void import('../pages/MenuPage')
      void import('../pages/CartPage')
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(run, 900)
    return () => clearTimeout(id)
  }, [])

  /** When the cart has items, user often goes to checkout next — prefetch that chunk too. */
  useEffect(() => {
    if (isNativeCustomerApp()) return
    if (itemCount <= 0) return
    const run = () => {
      void import('../pages/CheckoutPage')
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(run, 700)
    return () => clearTimeout(id)
  }, [itemCount])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileMenuOpen])

  // Apply dynamic theme
  useDynamicTheme()

  async function handleSignOut() {
    const needAuthRedirect = ['/orders', '/cart', '/reviews', '/referral', '/checkout', '/profile'].some((p) =>
      location.pathname.startsWith(p),
    )
    const next = `${location.pathname}${location.search}` || '/menu'
    await supabase.auth.signOut()
    useSessionStore.getState().clearAuth()
    useCartStore.getState().clearCart()
    await useCartStore.persist.rehydrate()
    setMobileMenuOpen(false)
    setAccountMenuOpen(false)
    if (needAuthRedirect) {
      navigate(`/login?next=${encodeURIComponent(next)}`)
    }
  }

  return (
    <div className="enhanced-layout">
      {/* Enhanced Header */}
      <header className="enhanced-header">
        {!orderAvailabilityStatus.is_open_now && (
          <div className="header-announcement">
            <div className="announcement-content">
              <span className="announcement-text announcement-with-icon">
                <span className="announcement-icon" aria-hidden>
                  <UtensilsIcon />
                </span>
                {orderAvailabilityMessage}
                {nextOpenLabel ? ` ${language === 'ar' ? 'يفتح مجدداً:' : 'Opens again:'} ${nextOpenLabel}` : ''}
              </span>
            </div>
          </div>
        )}
        {restaurantSettings.delivery_banner_enabled && (
          <div className="header-announcement">
            <div className="announcement-content">
              <span className="announcement-text announcement-with-icon">
                <span className="announcement-icon" aria-hidden>
                  <TruckIcon />
                </span>
                {language === 'ar'
                  ? `${restaurantSettings.delivery_banner_text_ar || 'توصيل مجاني'} ${restaurantSettings.delivery_threshold} ${restaurantSettings.currency_code}`
                  : `${restaurantSettings.delivery_banner_text_en || 'Free delivery on orders over'} ${restaurantSettings.delivery_threshold} ${restaurantSettings.currency_code}`}
              </span>
            </div>
          </div>
        )}

        <div className="header-main">
          <div className="header-inner">
            <Link to="/menu" className="brand">
              {restaurantSettings.logo_url ? (
                <img
                  ref={(el) => {
                    el?.setAttribute('fetchpriority', 'high')
                  }}
                  src={restaurantSettings.logo_url}
                  alt={language === 'ar' ? restaurantSettings.restaurant_name_ar : restaurantSettings.restaurant_name_en}
                  className="brand-logo"
                  decoding="async"
                />
              ) : (
                <div className="brand-icon" aria-hidden>
                  <UtensilsIcon />
                </div>
              )}
              <div className="brand-text">
                <span className="brand-name">
                  {language === 'ar' ? restaurantSettings.restaurant_name_ar : restaurantSettings.restaurant_name_en}
                </span>
                <span className="brand-tagline">
                  {language === 'ar' ? restaurantSettings.restaurant_tagline_ar : restaurantSettings.restaurant_tagline_en}
                </span>
              </div>
            </Link>

            <nav className="header-nav">
              <div className="nav-links">
                <Link to="/menu" className="nav-link">
                  {language === 'ar' ? 'القائمة' : 'Menu'}
                </Link>
                <Link to="/offers" className="nav-link">
                  {language === 'ar' ? 'العروض' : 'Offers'}
                </Link>
                <button type="button" className="nav-link review-link" onClick={() => navigate('/reviews')}>
                  {language === 'ar' ? 'التقييمات' : 'Reviews'}
                </button>
              </div>

              <div className="header-actions">
                <button
                  className="lang-toggle"
                  onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                  aria-label="Toggle language"
                >
                  {language === 'en' ? 'العربية' : 'English'}
                </button>

                <div className="header-account" ref={accountWrapRef}>
                  {customerId ? (
                    <>
                      <button
                        type="button"
                        className={`header-account-trigger ${accountMenuOpen ? 'is-open' : ''}`}
                        id="header-account-trigger"
                        aria-controls="header-account-menu"
                        aria-expanded={accountMenuOpen}
                        aria-haspopup="menu"
                        aria-label={language === 'ar' ? 'قائمة الحساب' : 'Account menu'}
                        onClick={() => {
                          setMobileMenuOpen(false)
                          setAccountMenuOpen((o) => !o)
                        }}
                      >
                        <span className="header-account-initial" aria-hidden>
                          {accountInitial}
                        </span>
                      </button>
                      {accountMenuOpen && (
                        <div
                          className="header-account-dropdown"
                          id="header-account-menu"
                          role="menu"
                          aria-labelledby="header-account-trigger"
                        >
                          <Link
                            to="/profile"
                            role="menuitem"
                            className="header-account-item"
                            onClick={() => setAccountMenuOpen(false)}
                          >
                            {language === 'ar' ? 'الملف الشخصي' : 'Profile'}
                          </Link>
                          <Link
                            to="/orders"
                            role="menuitem"
                            className="header-account-item"
                            onClick={() => setAccountMenuOpen(false)}
                          >
                            {language === 'ar' ? 'طلباتي' : 'My orders'}
                          </Link>
                          <button
                            type="button"
                            role="menuitem"
                            className="header-account-item header-account-item--signout"
                            onClick={() => {
                              setAccountMenuOpen(false)
                              void handleSignOut()
                            }}
                          >
                            {language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to="/login"
                      className="header-account-trigger header-account-trigger--guest"
                      aria-label={language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <UserCircleIcon className="header-account-guest-icon" />
                    </Link>
                  )}
                </div>

                {!isTrackPage && (
                  <button
                    className="cart-btn"
                    onClick={() => navigate('/cart')}
                    aria-label={`Cart with ${itemCount} items`}
                  >
                    <CartIcon className="cart-icon-svg" />
                    {itemCount > 0 && (
                      <span className="cart-badge">{itemCount > 99 ? '99+' : itemCount}</span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  className={`mobile-menu-toggle ${mobileMenuOpen ? 'is-open' : ''}`}
                  onClick={() => {
                    setAccountMenuOpen(false)
                    setMobileMenuOpen((open) => !open)
                  }}
                  aria-label={language === 'ar' ? 'القائمة' : 'Menu'}
                  aria-expanded={mobileMenuOpen}
                  aria-controls="mobile-nav-panel"
                >
                  <MenuIcon />
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <>
            <button
              type="button"
              className="mobile-menu-backdrop"
              aria-hidden
              tabIndex={-1}
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="mobile-menu" id="mobile-nav-panel" role="navigation" aria-label={language === 'ar' ? 'التنقل' : 'Main menu'}>
            <div className="mobile-menu-content">
              <Link to="/menu" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                {language === 'ar' ? 'القائمة' : 'Menu'}
              </Link>
              <Link to="/offers" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                {language === 'ar' ? 'العروض' : 'Offers'}
              </Link>
              <button type="button" className="mobile-nav-link" onClick={() => { navigate('/reviews'); setMobileMenuOpen(false); }}>
                {language === 'ar' ? 'التقييمات' : 'Reviews'}
              </button>
              {!customerId && (
                <Link to="/login" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                  {language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}
                </Link>
              )}
            </div>
            </div>
          </>
        )}
      </header>

      {/* Enhanced Main Content */}
      <main className="enhanced-main">
        <div className="main-wrapper">
          {showOrderProgressBanner && activeOrder ? (
            <OrderProgressBanner order={activeOrder} isCancelled={activeOrderCancelled} />
          ) : null}
          <Outlet />
        </div>
      </main>

      {/* Enhanced Footer */}
      <footer className="enhanced-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>{language === 'ar' ? 'عن المطعم' : 'About The Restaurant'}</h4>
            <p>{language === 'ar' ? 'نقدم لكم تجربة طعام استثنائية مع مكونات طازجة ومذاق لا يُنسى.' : 'We deliver an exceptional dining experience with fresh ingredients and unforgettable taste.'}</p>
          </div>
          
          <div className="footer-section">
            <h4>{language === 'ar' ? 'روابط سريعة' : 'Quick Links'}</h4>
            <ul>
              <li><Link to="/menu">{language === 'ar' ? 'القائمة' : 'Menu'}</Link></li>
              <li><Link to="/offers">{language === 'ar' ? 'العروض' : 'Offers'}</Link></li>
              <li>
                <button type="button" className="footer-quick-link" onClick={() => navigate('/reviews')}>
                  {language === 'ar' ? 'التقييمات' : 'Reviews'}
                </button>
              </li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>{language === 'ar' ? 'الخصوصية' : 'Privacy'}</h4>
            <ul>
              <li><Link to="/privacy">{language === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link></li>
              <li><Link to="/data-protection">{language === 'ar' ? 'حماية البيانات' : 'Data Protection'}</Link></li>
              <li>
                <Link to="/data-protection">
                  {language === 'ar' ? 'حذف بياناتي' : 'Delete my data'}
                </Link>
              </li>
            </ul>
          </div>
          
          <div className="footer-section">
            <h4>{language === 'ar' ? 'التواصل' : 'Contact'}</h4>
            <p className="footer-contact-row">
              <PhoneIcon />
              <a href={`tel:${restaurantSettings.contact_phone}`}>{restaurantSettings.contact_phone}</a>
            </p>
            <p className="footer-contact-row">
              <MailIcon />
              <a href={`mailto:${restaurantSettings.contact_email}`}>{restaurantSettings.contact_email}</a>
            </p>
            {restaurantSettings.contact_address_en && (
              <p className="footer-contact-row">
                <MapPinIcon />
                <span>{language === 'ar' ? restaurantSettings.contact_address_ar : restaurantSettings.contact_address_en}</span>
              </p>
            )}
            <div className="social-links">
              {restaurantSettings.social_facebook && (
                <a href={restaurantSettings.social_facebook} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Facebook">
                  <FacebookIcon />
                </a>
              )}
              {restaurantSettings.social_instagram && (
                <a href={restaurantSettings.social_instagram} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                  <InstagramIcon />
                </a>
              )}
              {restaurantSettings.social_twitter && (
                <a href={restaurantSettings.social_twitter} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="X">
                  <TwitterIcon />
                </a>
              )}
              {restaurantSettings.social_whatsapp && (
                <a href={restaurantSettings.social_whatsapp} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="WhatsApp">
                  <WhatsAppIcon />
                </a>
              )}
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; 2024 {language === 'ar' ? restaurantSettings.restaurant_name_ar : restaurantSettings.restaurant_name_en}. {language === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.</p>
        </div>
      </footer>

      <style>{`
        .enhanced-layout {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          overflow-x: clip;
        }

        .enhanced-header {
          position: relative;
          z-index: 200;
          isolation: isolate;
        }

        /* Header Announcement */
        .header-announcement {
          background: linear-gradient(90deg, var(--gold), var(--gold-dark));
          color: var(--cream);
          text-align: center;
          padding: 0.5rem;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .announcement-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        .announcement-text {
          animation: slideIn 0.5s ease;
        }

        .announcement-with-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .announcement-icon {
          display: inline-flex;
          opacity: 0.95;
        }

        .footer-contact-row {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .footer-contact-row svg {
          flex-shrink: 0;
          margin-top: 0.15rem;
          opacity: 0.85;
        }

        .footer-contact-row a {
          color: var(--footer-fg);
        }

        .footer-contact-row a:hover {
          color: var(--gold-light);
        }

        .enhanced-footer .footer-contact-row span {
          color: var(--footer-fg-muted);
        }

        @keyframes slideIn {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* Header Main */
        .header-main {
          position: sticky;
          top: 0;
          z-index: 100;
          background: color-mix(in srgb, var(--cream) 92%, transparent);
          backdrop-filter: blur(18px) saturate(1.4);
          -webkit-backdrop-filter: blur(18px) saturate(1.4);
          border-bottom: 3px solid var(--gold);
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.55) inset,
            0 10px 40px rgba(14, 14, 14, 0.08);
        }

        .header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          transition: transform 0.2s ease;
        }

        .brand:hover {
          transform: scale(1.02);
        }

        .brand-logo {
          width: 48px;
          height: 48px;
          object-fit: contain;
          filter: drop-shadow(0 2px 4px rgba(184,151,90,0.3));
        }

        .brand-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--gold);
          filter: drop-shadow(0 2px 4px rgba(184,151,90,0.25));
        }

        .cart-icon-svg {
          display: block;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .brand-name {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: 0.02em;
          line-height: 1;
        }

        .brand-tagline {
          font-size: 0.65rem;
          font-weight: 400;
          color: var(--gold);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .header-nav {
          display: flex;
          align-items: center;
          gap: 2rem;
          min-width: 0;
        }

        .nav-links {
          display: flex;
          gap: 1rem;
        }

        .nav-link {
          text-decoration: none;
          font-weight: 500;
          color: var(--ink-soft);
          padding: 0.5rem 1rem;
          border-radius: 25px;
          transition: all 0.3s ease;
          position: relative;
        }

        .nav-link:hover {
          color: var(--gold);
          background: rgba(184,151,90,0.1);
        }

        .nav-link.review-link {
          background: var(--gold);
          color: var(--cream);
        }

        .nav-link.review-link:hover {
          background: var(--gold-dark);
          color: var(--cream);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .header-account {
          position: relative;
          flex-shrink: 0;
        }

        .header-account-trigger {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid var(--border);
          background: var(--cream);
          color: var(--ink);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
          box-shadow: 0 2px 8px rgba(14, 14, 14, 0.06);
        }

        .header-account-trigger:hover,
        .header-account-trigger.is-open {
          border-color: var(--gold);
          background: rgba(184, 151, 90, 0.08);
          box-shadow: 0 4px 14px rgba(184, 151, 90, 0.2);
        }

        .header-account-trigger--guest {
          text-decoration: none;
          color: var(--ink-soft);
        }

        .header-account-trigger--guest:hover {
          color: var(--gold);
        }

        .header-account-guest-icon {
          width: 22px;
          height: 22px;
        }

        .header-account-initial {
          font-family: var(--font-display);
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1;
        }

        .header-account-dropdown {
          position: absolute;
          top: calc(100% + 0.35rem);
          right: 0;
          min-width: 11.75rem;
          padding: 0.35rem 0;
          background: var(--cream);
          border: 1px solid rgba(184, 151, 90, 0.35);
          border-radius: 14px;
          box-shadow: var(--elev-3);
          z-index: 1310;
          animation: accountMenuIn 0.18s ease;
        }

        @keyframes accountMenuIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        [dir="rtl"] .header-account-dropdown {
          right: auto;
          left: 0;
        }

        .header-account-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0.55rem 1rem;
          border: none;
          background: none;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--ink);
          text-align: start;
          text-decoration: none;
          cursor: pointer;
          transition: background var(--transition), color var(--transition);
        }

        .header-account-item:hover {
          background: rgba(184, 151, 90, 0.12);
          color: var(--gold-dark);
        }

        .header-account-item--signout {
          color: #b91c1c;
          border-top: 1px solid var(--border);
          margin-top: 0.2rem;
          padding-top: 0.65rem;
        }

        .header-account-item--signout:hover {
          background: rgba(185, 28, 28, 0.08);
          color: #991b1b;
        }

        .lang-toggle {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--ink-soft);
          padding: 0.4rem 0.8rem;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: transparent;
          transition: all 0.3s ease;
          letter-spacing: 0.02em;
        }

        .lang-toggle:hover {
          border-color: var(--gold);
          color: var(--gold);
          background: rgba(184,151,90,0.1);
        }

        .cart-btn {
          position: relative;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--ink);
          color: var(--cream);
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(14,14,14,0.2);
        }

        .cart-btn:hover {
          background: var(--gold);
          transform: scale(1.05);
          box-shadow: 0 6px 20px rgba(184,151,90,0.4);
        }

        .cart-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 20px;
          height: 20px;
          padding: 0 4px;
          background: #ef4444;
          color: white;
          font-size: 0.7rem;
          font-weight: 700;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--cream);
          animation: bounce 0.3s ease;
        }

        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }

        .mobile-menu-toggle {
          display: none;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 1.25rem;
          color: var(--ink);
          cursor: pointer;
          padding: 0.45rem;
          min-width: 44px;
          min-height: 44px;
          transition: background var(--transition), border-color var(--transition);
        }

        .mobile-menu-toggle:hover {
          border-color: var(--gold);
          background: rgba(184, 151, 90, 0.08);
        }

        .mobile-menu-toggle.is-open {
          border-color: var(--gold);
          background: rgba(184, 151, 90, 0.15);
        }

        /* Mobile Menu — visibility controlled by React (do not use :not(.open) without that class) */
        .mobile-menu-backdrop {
          display: none;
        }

        .mobile-menu {
          display: none;
          position: absolute;
          top: calc(100% + 0.4rem);
          left: 0.75rem;
          right: 0.75rem;
          z-index: 1301;
          background: var(--cream);
          border: 1px solid rgba(184, 151, 90, 0.35);
          border-bottom-width: 2px;
          border-radius: 18px;
          box-shadow: var(--elev-3);
          animation: menuSlideDown 0.22s ease;
        }

        @keyframes menuSlideDown {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .mobile-menu-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          max-height: calc(100dvh - 120px);
          overflow-y: auto;
        }

        .mobile-nav-link {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0.85rem 1rem;
          text-decoration: none;
          color: var(--ink);
          font-weight: 600;
          font-size: 0.92rem;
          letter-spacing: 0.02em;
          border-radius: var(--radius-md);
          border: 1px solid rgba(14, 14, 14, 0.08);
          background: var(--surface);
          box-shadow: var(--elev-1);
          transition: border-color var(--transition), background var(--transition), color var(--transition);
          font-family: inherit;
          cursor: pointer;
          text-align: inherit;
        }

        .mobile-nav-link:hover {
          border-color: rgba(184, 151, 90, 0.55);
          background: rgba(184, 151, 90, 0.1);
          color: var(--ink);
        }

        .mobile-nav-link:active {
          transform: scale(0.99);
        }

        [dir="rtl"] .mobile-nav-link {
          justify-content: flex-end;
        }

        /* Main Content */
        .enhanced-main {
          flex: 1;
          background:
            radial-gradient(ellipse 70% 45% at 50% 0%, rgba(184, 151, 90, 0.06), transparent 60%),
            linear-gradient(180deg, var(--cream) 0%, var(--cream-2) 100%);
        }

        .main-wrapper {
          max-width: var(--container-wide);
          margin: 0 auto;
          min-height: 100%;
          width: 100%;
        }

        /* Footer — light text on dark bar (do not use --ink-* here: those are for light backgrounds) */
        .enhanced-footer {
          --footer-fg: rgba(250, 248, 244, 0.95);
          --footer-fg-muted: rgba(250, 248, 244, 0.78);
          --footer-fg-soft: rgba(250, 248, 244, 0.65);
          background: linear-gradient(145deg, #0e0e0e 0%, #1a1814 45%, #252016 100%);
          color: var(--footer-fg);
          padding: 4rem 0 2rem;
          margin-top: auto;
          position: relative;
          overflow: hidden;
        }

        .enhanced-footer::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          opacity: 0.3;
        }

        .footer-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 3rem;
          margin-bottom: 3rem;
          position: relative;
          z-index: 1;
        }

        .footer-section h4 {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          color: var(--gold);
          letter-spacing: 0.02em;
          text-transform: uppercase;
          position: relative;
        }

        .footer-section h4::after {
          content: '';
          position: absolute;
          bottom: -0.5rem;
          left: 0;
          width: 40px;
          height: 2px;
          background: var(--gold);
          border-radius: 1px;
        }

        [dir="rtl"] .footer-section h4::after {
          left: auto;
          right: 0;
        }

        .footer-section p {
          line-height: 1.7;
          color: var(--footer-fg-muted);
          margin-bottom: 1rem;
          font-size: 0.95rem;
          font-weight: 400;
        }

        .footer-section ul {
          list-style: none;
          padding: 0;
        }

        .footer-section li {
          margin-bottom: 0.8rem;
          position: relative;
          padding-left: 1.2rem;
        }

        .footer-section li::before {
          content: '▸';
          position: absolute;
          left: 0;
          color: var(--gold);
          font-size: 0.8rem;
          transition: transform 0.2s ease;
        }

        .footer-section a,
        .footer-section .footer-quick-link {
          color: var(--footer-fg);
          text-decoration: none;
          transition: color 0.2s ease, transform 0.2s ease;
          font-weight: 500;
          font-size: 0.95rem;
          font-family: inherit;
          background: none;
          border: none;
          cursor: pointer;
          text-align: inherit;
          padding: 0;
          display: inline;
        }

        .footer-section a:hover,
        .footer-section .footer-quick-link:hover {
          color: var(--gold-light);
        }

        [dir="ltr"] .footer-section a:hover,
        [dir="ltr"] .footer-section .footer-quick-link:hover {
          transform: translateX(3px);
        }

        [dir="rtl"] .footer-section a:hover,
        [dir="rtl"] .footer-section .footer-quick-link:hover {
          transform: translateX(-3px);
        }

        .footer-section li:hover::before {
          transform: translateX(2px);
        }

        .social-links {
          display: flex;
          gap: 1.2rem;
          margin-top: 1.5rem;
        }

        .social-link {
          font-size: 1rem;
          color: var(--footer-fg);
          cursor: pointer;
          transition: all 0.3s ease;
          background: rgba(250, 248, 244, 0.08);
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(184, 151, 90, 0.35);
        }

        .social-link svg {
          width: 20px;
          height: 20px;
        }

        .social-link:hover {
          transform: scale(1.1);
          color: var(--gold);
          background: rgba(255, 255, 255, 0.2);
          border-color: var(--gold);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .footer-bottom {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2.5rem 2rem 1rem;
          border-top: 1px solid rgba(184, 151, 90, 0.25);
          text-align: center;
          color: var(--footer-fg-soft);
          font-size: 0.9rem;
          font-weight: 400;
          letter-spacing: 0.02em;
          position: relative;
          background: rgba(0, 0, 0, 0.25);
        }

        .footer-bottom p {
          margin: 0;
          opacity: 0.8;
        }

        /* Responsive — tablet / phone */
        @media (max-width: 768px) {
          .header-announcement {
            padding: 0.45rem 0;
            font-size: 0.76rem;
          }

          .announcement-content {
            padding: 0 0.75rem;
          }

          .announcement-with-icon {
            flex-wrap: wrap;
            line-height: 1.35;
          }

          .nav-links {
            display: none;
          }

          .mobile-menu-toggle {
            display: flex;
          }

          .mobile-menu-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 1299;
            background: rgba(14, 14, 14, 0.22);
            border: none;
          }

          .mobile-menu {
            display: block;
          }

          .header-inner {
            height: auto;
            min-height: 56px;
            padding: 0.5rem 0.75rem;
            gap: 0.5rem;
            align-items: center;
          }

          .header-main {
            z-index: 1300;
          }

          .brand {
            flex: 1;
            min-width: 0;
            gap: 0.5rem;
            align-items: center;
          }

          .brand-logo,
          .brand-icon {
            width: 40px;
            height: 40px;
            flex-shrink: 0;
          }

          .brand-text {
            min-width: 0;
          }

          .brand-name {
            font-size: clamp(0.95rem, 3.5vw, 1.2rem);
            line-height: 1.2;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .brand-tagline {
            font-size: 0.58rem;
            letter-spacing: 0.08em;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .header-nav {
            flex-shrink: 0;
            gap: 0.35rem;
          }

          .header-actions {
            gap: 0.35rem;
          }

          .lang-toggle {
            padding: 0.35rem 0.55rem;
            font-size: 0.72rem;
          }

          .cart-btn {
            width: 42px;
            height: 42px;
          }

          .header-account-trigger {
            width: 42px;
            height: 42px;
          }

          .header-account-guest-icon {
            width: 20px;
            height: 20px;
          }

          .header-account-initial {
            font-size: 0.75rem;
          }

          .footer-content {
            grid-template-columns: 1fr;
            text-align: start;
            padding: 0 1.25rem;
            gap: 2rem;
          }

          .footer-section li {
            padding-left: 0;
          }

          .footer-section li::before {
            display: none;
          }

          .social-links {
            justify-content: flex-start;
          }

          [dir="rtl"] .cart-badge {
            right: auto;
            left: -4px;
          }
        }

        @media (max-width: 380px) {
          .header-inner {
            padding: 0.45rem 0.5rem;
          }

          .brand-tagline {
            display: none;
          }

          .lang-toggle {
            padding: 0.3rem 0.45rem;
          }

          .mobile-menu {
            left: 0.5rem;
            right: 0.5rem;
          }
        }

        @media (max-width: 480px) {
          .enhanced-footer {
            padding: 3rem 0 1.5rem;
          }

          .footer-bottom {
            padding: 2rem 1rem 1rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .announcement-text {
            animation: none;
          }
          .brand {
            transition: none;
          }
          .brand:hover {
            transform: none;
          }
          .mobile-nav-link:active {
            transform: none;
          }
          .footer-section li::before {
            transition: none;
          }
          .header-account-dropdown {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
