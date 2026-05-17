import { useNavigate } from 'react-router-dom'
import {
  CUSTOMER_APP_DISPLAY_NAME,
  CUSTOMER_APP_DISPLAY_NAME_AR,
  CUSTOMER_APP_WELCOME_LOGO_WHITE_URL,
} from '../lib/appBrand'
import { NATIVE_WELCOME_SESSION_KEY } from '../lib/nativeWelcomeGate'
import { useSessionStore } from '../store/sessionStore'
import { useRestaurantSettings } from '../hooks/useRestaurantSettings'
import type { Language } from '../../types'

export default function NativeStartPage() {
  const navigate = useNavigate()
  const { language, setLanguage } = useSessionStore()
  const { settings } = useRestaurantSettings()
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  const welcomeLogo =
    settings.welcome_logo_url || settings.loading_logo_url || settings.logo_url || CUSTOMER_APP_WELCOME_LOGO_WHITE_URL
  const displayNameEn = settings.restaurant_name_en || CUSTOMER_APP_DISPLAY_NAME
  const displayNameAr = settings.restaurant_name_ar || CUSTOMER_APP_DISPLAY_NAME_AR
  function pickLanguage(lang: Language) {
    setLanguage(lang)
  }

  function finishToMenu() {
    try {
      sessionStorage.setItem(NATIVE_WELCOME_SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    navigate('/menu', { replace: true })
  }

  function goLogin() {
    try {
      sessionStorage.setItem(NATIVE_WELCOME_SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    navigate('/login', { replace: true })
  }

  return (
    <div className="native-welcome">
      <div className="native-welcome-card">
        <img
          src={welcomeLogo}
          alt={t(displayNameEn, displayNameAr)}
          className="native-welcome-logo"
          width={280}
          height={80}
          decoding="async"
        />
        <h1 className="native-welcome-title">{t(displayNameEn, displayNameAr)}</h1>
        <p className="native-welcome-lead">
          {t('Choose your language, then sign in or browse the menu.', 'اختر لغتك، ثم سجّل الدخول أو تصفح القائمة.')}
        </p>

        <p className="native-welcome-section-label">{t('Language', 'اللغة')}</p>
        <div className="native-welcome-lang-row" role="group" aria-label={t('Language', 'اللغة')}>
          <button
            type="button"
            className={`native-welcome-lang ${language === 'en' ? 'active' : ''}`}
            onClick={() => pickLanguage('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`native-welcome-lang ${language === 'ar' ? 'active' : ''}`}
            onClick={() => pickLanguage('ar')}
          >
            العربية
          </button>
        </div>

        <div className="native-welcome-actions">
          <button type="button" className="native-welcome-btn native-welcome-btn-primary" onClick={goLogin}>
            {t('Sign in', 'تسجيل الدخول')}
          </button>
          <button type="button" className="native-welcome-btn native-welcome-btn-secondary" onClick={finishToMenu}>
            {t('Browse menu', 'تصفح القائمة')}
          </button>
        </div>
      </div>
      <style>{`
        .native-welcome {
          flex: 1;
          width: 100%;
          min-height: 100%;
          min-height: 100dvh;
          min-height: 100svh;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 1.5rem 1.25rem calc(2rem + env(safe-area-inset-bottom, 0px));
          background:
            radial-gradient(ellipse 100% 60% at 50% 0%, rgba(184, 151, 90, 0.2), transparent 50%),
            linear-gradient(165deg, #1a1410 0%, #120e0b 55%, #0a0806 100%);
        }
        .native-welcome-card {
          width: 100%;
          max-width: 22rem;
          text-align: center;
        }
        .native-welcome-logo {
          width: min(100%, 280px);
          height: auto;
          max-height: 100px;
          object-fit: contain;
          margin: 0 auto 1.15rem;
          display: block;
          filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.4));
        }
        .native-welcome-title {
          margin: 0 0 0.5rem;
          font-size: 1.65rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #fff8e7;
        }
        [dir='rtl'] .native-welcome-title {
          letter-spacing: 0.02em;
        }
        .native-welcome-lead {
          margin: 0 0 1.75rem;
          font-size: 0.95rem;
          line-height: 1.55;
          color: rgba(255, 243, 214, 0.72);
        }
        .native-welcome-section-label {
          margin: 0 0 0.5rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 243, 214, 0.55);
        }
        .native-welcome-lang-row {
          display: flex;
          gap: 0.6rem;
          margin-bottom: 1.75rem;
        }
        .native-welcome-lang {
          flex: 1;
          padding: 0.85rem 0.5rem;
          border-radius: 12px;
          border: 2px solid rgba(255, 243, 214, 0.22);
          background: rgba(255, 255, 255, 0.06);
          color: #fff8e7;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .native-welcome-lang.active {
          border-color: rgba(244, 211, 122, 0.85);
          background: rgba(184, 151, 90, 0.22);
        }
        .native-welcome-actions {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .native-welcome-btn {
          width: 100%;
          padding: 0.95rem 1rem;
          border-radius: 14px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          border: none;
        }
        .native-welcome-btn-primary {
          background: linear-gradient(135deg, var(--gold), var(--gold-dark));
          color: #0e0e0e;
        }
        .native-welcome-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: #fff8e7;
          border: 1px solid rgba(255, 243, 214, 0.28);
        }
      `}</style>
    </div>
  )
}
