// apps/customer/src/components/Layout.tsx
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useSessionStore } from '../store/sessionStore'

export default function Layout() {
  const itemCount = useCartStore((s) => s.itemCount())
  const { language, setLanguage } = useSessionStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isTrackPage = location.pathname.startsWith('/track')

  return (
    <div className="layout">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/menu" className="brand">
            <span className="brand-name">
              {language === 'ar' ? 'المطعم' : 'The Restaurant'}
            </span>
            <span className="brand-tagline">
              {language === 'ar' ? 'تجربة فاخرة' : 'A Premium Experience'}
            </span>
          </Link>

          <nav className="header-actions">
            <button
              className="lang-toggle"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              aria-label="Toggle language"
            >
              {language === 'en' ? 'العربية' : 'English'}
            </button>

            {!isTrackPage && (
              <button
                className="cart-btn"
                onClick={() => navigate('/cart')}
                aria-label={`Cart with ${itemCount} items`}
              >
                <CartIcon />
                {itemCount > 0 && (
                  <span className="cart-badge">{itemCount > 99 ? '99+' : itemCount}</span>
                )}
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <style>{`
        .layout {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
        }

        .site-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(250,248,244,0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }

        .header-inner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          text-decoration: none;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .brand-name {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 600;
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

        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .lang-toggle {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--ink-soft);
          padding: 0.35rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: transparent;
          transition: all var(--transition);
          letter-spacing: 0.02em;
        }

        .lang-toggle:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        .cart-btn {
          position: relative;
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--ink);
          color: var(--cream);
          transition: all var(--transition);
        }

        .cart-btn:hover {
          background: var(--gold);
          transform: scale(1.05);
        }

        .cart-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          background: var(--gold);
          color: white;
          font-size: 0.65rem;
          font-weight: 700;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--cream);
        }

        .main-content {
          flex: 1;
        }

        [dir="rtl"] .cart-badge {
          right: auto;
          left: -4px;
        }
      `}</style>
    </div>
  )
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  )
}
