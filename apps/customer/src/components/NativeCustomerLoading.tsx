/**
 * Branded loading UI for Capacitor (APK / iOS shell) only.
 * Desktop web keeps the minimal inline fallback in App.tsx / MenuPage.
 */
import {
  CUSTOMER_APP_DISPLAY_NAME,
  CUSTOMER_APP_DISPLAY_NAME_AR,
  CUSTOMER_APP_LOGO_URL,
} from '../lib/appBrand'
import { useRestaurantSettings } from '../hooks/useRestaurantSettings'
import { useSessionStore } from '../store/sessionStore'

type Props = {
  /** Menu route shows a short subtitle when custom copy is not set */
  variant?: 'route' | 'menu'
}

export function NativeCustomerLoading({ variant = 'route' }: Props) {
  const { settings } = useRestaurantSettings()
  const { language } = useSessionStore()

  const logoUrl =
    settings.loading_logo_url || settings.welcome_logo_url || settings.logo_url || CUSTOMER_APP_LOGO_URL
  const displayName =
    language === 'ar'
      ? settings.restaurant_name_ar || CUSTOMER_APP_DISPLAY_NAME_AR
      : settings.restaurant_name_en || CUSTOMER_APP_DISPLAY_NAME
  const defaultSubEn = variant === 'menu' ? 'Preparing your menu…' : 'Loading…'
  const defaultSubAr = variant === 'menu' ? 'جارٍ تحضير القائمة…' : 'جارٍ التحميل…'
  const subtitle =
    language === 'ar'
      ? settings.native_loading_text_ar || settings.native_loading_text_en || defaultSubAr
      : settings.native_loading_text_en || defaultSubAr
  const accent = settings.primary_color || '#b8975a'

  return (
    <div className="native-customer-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="native-customer-loading-card">
        <div className="native-customer-loading-logo-wrap">
          <img src={logoUrl} alt="" className="native-customer-loading-logo" decoding="async" />
          <span
            className="native-customer-loading-ring"
            style={{ borderTopColor: accent }}
            aria-hidden
          />
        </div>
        <p className="native-customer-loading-title">{displayName}</p>
        <p className="native-customer-loading-sub">{subtitle}</p>
      </div>
      <style>{`
        .native-customer-loading {
          min-height: 50vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
          background:
            radial-gradient(ellipse 120% 80% at 50% 0%, rgba(184, 151, 90, 0.18), transparent 55%),
            linear-gradient(165deg, #1a1410 0%, #120e0b 48%, #0c0907 100%);
        }
        .native-customer-loading-card {
          text-align: center;
          max-width: 280px;
        }
        .native-customer-loading-logo-wrap {
          position: relative;
          width: 88px;
          height: 88px;
          margin: 0 auto 1.1rem;
        }
        .native-customer-loading-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.45));
          animation: nativeLoadLogo 2.4s ease-in-out infinite;
        }
        .native-customer-loading-ring {
          position: absolute;
          inset: -6px;
          border-radius: 999px;
          border: 2px solid rgba(184, 151, 90, 0.35);
          animation: nativeLoadSpin 1.1s linear infinite;
        }
        .native-customer-loading-title {
          margin: 0 0 0.35rem;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #fff8e7;
        }
        .native-customer-loading-sub {
          margin: 0;
          font-size: 0.88rem;
          color: rgba(255, 243, 214, 0.62);
        }
        @keyframes nativeLoadSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes nativeLoadLogo {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.94); opacity: 0.88; }
        }
        @media (prefers-reduced-motion: reduce) {
          .native-customer-loading-logo,
          .native-customer-loading-ring {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
