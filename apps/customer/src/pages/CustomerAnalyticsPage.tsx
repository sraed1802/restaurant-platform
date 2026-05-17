// apps/customer/src/pages/CustomerAnalyticsPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../store/sessionStore'
import { supabase } from '../lib/supabase'

export default function CustomerAnalyticsPage() {
  const { language } = useSessionStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    try {
      // For now, show a simplified version without complex RPC calls
      // This will work with the existing database structure
      setLoading(false)
    } catch (error) {
      console.error('Failed to load analytics:', error)
      setError('Failed to load analytics data')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="customer-analytics-page">
        <div className="skeleton-loader">
          <div className="skeleton" style={{ height: 60, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 200, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="customer-analytics-page">
      <div className="analytics-header">
        <button 
          className="back-btn"
          onClick={() => navigate(-1)}
        >
          ← {t('Back', 'رجوع')}
        </button>
        <h1>{t('Customer Analytics', 'تحليلات العملاء')}</h1>
      </div>

      {error ? (
        <div className="error-message">
          <h3>{t('Analytics Temporarily Unavailable', 'التحليلات غير متاحة مؤقتًا')}</h3>
          <p>{t('We are working on enhancing our analytics features. Please check back soon!', 'نعمل على تحسين ميزات التحليل لدينا. يرجى التحقق مرة أخرى قريبًا!')}</p>
        </div>
      ) : (
        <div className="coming-soon">
          <div className="coming-soon-content">
            <h2>{t('Advanced Analytics Coming Soon', 'تحليلات متقدمة قريبًا')}</h2>
            <p>{t('We are building powerful customer analytics features including:', 'نحن نبني ميزات تحليل عملاء قوية تشمل:')}</p>
            <ul>
              <li>{t('Customer segmentation and insights', 'تقسيم العملاء ورؤى')}</li>
              <li>{t('Purchase pattern analysis', 'تحليل أنماط الشراء')}</li>
              <li>{t('Customer lifetime value tracking', 'تتبع قيمة العميل مدى الحياة')}</li>
              <li>{t('Retention and churn analysis', 'تحليل الاحتفاظ وفقدان العملاء')}</li>
              <li>{t('Revenue analytics and trends', 'تحليل الإيرادات والاتجاهات')}</li>
            </ul>
            <div className="placeholder-stats">
              <div className="stat-card">
                <h3>📊</h3>
                <p>{t('Analytics Dashboard', 'لوحة تحليلات')}</p>
              </div>
              <div className="stat-card">
                <h3>👥</h3>
                <p>{t('Customer Insights', 'رؤى العملاء')}</p>
              </div>
              <div className="stat-card">
                <h3>📈</h3>
                <p>{t('Revenue Tracking', 'تتبع الإيرادات')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .customer-analytics-page {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          min-height: 100vh;
        }

        .analytics-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .analytics-header h1 {
          font-size: 2rem;
          font-weight: 600;
          color: var(--ink);
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

        .error-message {
          background: var(--surface);
          border: 1px solid var(--danger-border);
          border-radius: var(--radius-md);
          padding: 2rem;
          text-align: center;
        }

        .error-message h3 {
          color: var(--danger);
          font-size: 1.3rem;
          margin-bottom: 1rem;
        }

        .error-message p {
          color: var(--ink-muted);
        }

        .coming-soon {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 2rem;
        }

        .coming-soon-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 1rem;
          text-align: center;
        }

        .coming-soon-content p {
          color: var(--ink-soft);
          margin-bottom: 1.5rem;
        }

        .coming-soon-content ul {
          list-style: none;
          padding: 0;
          margin-bottom: 2rem;
        }

        .coming-soon-content li {
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border);
          color: var(--ink);
        }

        .coming-soon-content li:before {
          content: "✨ ";
          color: var(--gold);
        }

        .placeholder-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 2rem;
        }

        .stat-card {
          background: var(--cream-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          text-align: center;
          transition: all 0.2s ease;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .stat-card h3 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .stat-card p {
          font-size: 0.9rem;
          color: var(--ink-muted);
          font-weight: 500;
        }

        .skeleton-loader {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .skeleton {
          background: linear-gradient(90deg, var(--cream-3) 25%, var(--cream-2) 50%, var(--cream-3) 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: var(--radius-sm);
        }

        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 768px) {
          .customer-analytics-page {
            padding: 1rem;
          }

          .analytics-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .placeholder-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
