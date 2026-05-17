// apps/customer/src/pages/ReferralPage.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../store/sessionStore'
import { useSessionStoreHydrated } from '../hooks/useSessionStoreHydrated'
import ReferralProgram from '../components/ReferralProgram'

export default function ReferralPage() {
  const { language, customerId } = useSessionStore()
  const sessionHydrated = useSessionStoreHydrated()
  const navigate = useNavigate()

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  useEffect(() => {
    if (!sessionHydrated) return
    if (!customerId) {
      navigate('/menu', { replace: true })
    }
  }, [sessionHydrated, customerId, navigate])

  if (!sessionHydrated || !customerId) {
    return null
  }

  return (
    <div className="referral-page">
      <div className="page-header">
        <button 
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← {t('Back', 'رجوع')}
        </button>
        <h1>{t('Referral Program', 'برنامج الإحالة')}</h1>
      </div>

      <ReferralProgram />

      <style>{`
        .referral-page {
          min-height: 100vh;
          background: var(--cream);
        }

        .page-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
        }

        .back-btn {
          background: none;
          border: none;
          font-size: 1.2rem;
          color: var(--ink);
          cursor: pointer;
          padding: 0.5rem;
          border-radius: var(--radius-sm);
          transition: background 0.2s ease;
        }

        .back-btn:hover {
          background: var(--cream-2);
        }

        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--ink);
        }
      `}</style>
    </div>
  )
}
