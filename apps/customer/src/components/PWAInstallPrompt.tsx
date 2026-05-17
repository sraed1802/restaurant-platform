// apps/customer/src/components/PWAInstallPrompt.tsx
import { useState, useEffect } from 'react'
import { pwaManager } from '../lib/pwa'
import { useSessionStore } from '../store/sessionStore'

export default function PWAInstallPrompt() {
  const { language } = useSessionStore()
  const [showPrompt, setShowPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  useEffect(() => {
    // Check if app can be installed and hasn't been dismissed
    if (pwaManager.canInstall() && !dismissed) {
      // Show prompt after a delay to let user explore the app
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [dismissed])

  const handleInstall = async () => {
    const success = await pwaManager.showInstallPrompt()
    if (success) {
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setDismissed(true)
    // Store dismissal in localStorage to not show again
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  // Check if user has previously dismissed the prompt
  useEffect(() => {
    const wasDismissed = localStorage.getItem('pwa-install-dismissed')
    if (wasDismissed) {
      setDismissed(true)
    }
  }, [])

  if (!showPrompt || dismissed || pwaManager.isStandalone()) {
    return null
  }

  return (
    <div className="pwa-install-prompt">
      <div className="pwa-prompt-content">
        <div className="pwa-prompt-icon">
          📱
        </div>
        <div className="pwa-prompt-text">
          <h4>{t('Install RMS Restaurant', 'ثبّت مطعم RMS')}</h4>
          <p>{t('Get the full experience with our app', 'احصل على التجربة الكاملة مع تطبيقنا')}</p>
        </div>
        <div className="pwa-prompt-actions">
          <button 
            className="pwa-install-btn"
            onClick={handleInstall}
          >
            {t('Install', 'تثبيت')}
          </button>
          <button 
            className="pwa-dismiss-btn"
            onClick={handleDismiss}
          >
            {t('Not now', 'ليس الآن')}
          </button>
        </div>
      </div>

      <style>{`
        .pwa-install-prompt {
          position: fixed;
          bottom: 1rem;
          left: 1rem;
          right: 1rem;
          background: var(--surface);
          border: 2px solid var(--gold);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          z-index: 1000;
          animation: slideUp 0.4s ease;
        }

        @media (min-width: 768px) {
          .pwa-install-prompt {
            bottom: 1.5rem;
            left: auto;
            right: 1.5rem;
            width: 380px;
          }
        }

        .pwa-prompt-content {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
        }

        .pwa-prompt-icon {
          font-size: 2rem;
          flex-shrink: 0;
        }

        .pwa-prompt-text {
          flex: 1;
        }

        .pwa-prompt-text h4 {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.25rem;
        }

        .pwa-prompt-text p {
          font-size: 0.85rem;
          color: var(--ink-muted);
          line-height: 1.4;
        }

        .pwa-prompt-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        @media (min-width: 768px) {
          .pwa-prompt-actions {
            flex-direction: row;
          }
        }

        .pwa-install-btn {
          padding: 0.5rem 1rem;
          background: var(--gold);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pwa-install-btn:hover {
          background: var(--gold-dark);
          transform: translateY(-1px);
        }

        .pwa-dismiss-btn {
          padding: 0.5rem 1rem;
          background: transparent;
          color: var(--ink-muted);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pwa-dismiss-btn:hover {
          border-color: var(--ink);
          color: var(--ink);
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
