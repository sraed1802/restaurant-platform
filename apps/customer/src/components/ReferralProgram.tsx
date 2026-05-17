import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { isReferralRpcUnavailable } from '../lib/referralRpcErrors'

interface ReferralStats {
  total_referrals: number
  active_referrals: number
  total_rewards: number
  pending_rewards: number
  referral_code: string
  referral_link: string
}

interface ReferralProcessResult {
  success: boolean
  message: string
  reward_amount: number
}

function normalizeReferralStatsRow(data: unknown): ReferralStats | null {
  if (data == null) return null
  if (Array.isArray(data)) {
    const first = data[0]
    return first && typeof first === 'object' ? (first as ReferralStats) : null
  }
  if (typeof data === 'object') return data as ReferralStats
  return null
}

function logReferralDev(message: string, error: unknown) {
  if (import.meta.env.DEV && !isReferralRpcUnavailable(error)) {
    console.error(message, error)
  }
}

export default function ReferralProgram() {
  const { language, customerId } = useSessionStore()
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [referralUnavailable, setReferralUnavailable] = useState(false)
  const [referralInput, setReferralInput] = useState('')
  const [applyingReferral, setApplyingReferral] = useState(false)
  const [generateBlocked, setGenerateBlocked] = useState(false)

  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  useEffect(() => {
    if (customerId) {
      void loadReferralStats()
    }
  }, [customerId])

  async function loadReferralStats() {
    if (!customerId) return

    setReferralUnavailable(false)
    try {
      const { data, error } = await supabase.rpc('get_referral_stats', {
        p_customer_id: customerId,
      })

      if (error) {
        if (isReferralRpcUnavailable(error)) {
          setReferralUnavailable(true)
          setStats(null)
          return
        }
        logReferralDev('Failed to load referral stats:', error)
        setStats(null)
        return
      }

      setStats(normalizeReferralStatsRow(data))
    } catch (error) {
      logReferralDev('Failed to load referral stats:', error)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  async function generateReferralCode() {
    if (!customerId || referralUnavailable) return

    setGenerateBlocked(false)
    try {
      const { data, error } = await supabase.rpc('create_customer_referral_code', {
        p_customer_id: customerId,
      })

      if (error) {
        if (isReferralRpcUnavailable(error)) {
          setReferralUnavailable(true)
          return
        }
        logReferralDev('Failed to generate referral code:', error)
        setGenerateBlocked(true)
        return
      }

      if (data) {
        void loadReferralStats()
      }
    } catch (error) {
      logReferralDev('Failed to generate referral code:', error)
      setGenerateBlocked(true)
    }
  }

  async function applyReferralCode() {
    if (!customerId || !referralInput.trim() || referralUnavailable) return

    setApplyingReferral(true)
    try {
      const { data, error } = await supabase.rpc('process_referral', {
        p_referral_code: referralInput.trim(),
        p_referred_id: customerId,
      })

      if (error) {
        if (isReferralRpcUnavailable(error)) {
          setReferralUnavailable(true)
          alert(
            t(
              'Referrals are not available on this server yet.',
              'الإحالات غير متاحة على هذا الخادم بعد.',
            ),
          )
          return
        }
        logReferralDev('Failed to apply referral:', error)
        alert(t('Failed to apply referral', 'فشل في تطبيق الإحالة'))
        return
      }

      const rows = Array.isArray(data) ? data : data != null ? [data] : []
      const result = rows[0] as ReferralProcessResult | undefined

      if (result?.success) {
        alert(t('Referral applied successfully!', 'تم تطبيق الإحالة بنجاح!'))
        setReferralInput('')
        void loadReferralStats()
      } else {
        alert(t(result?.message || 'Failed to apply referral', result?.message || 'فشل في تطبيق الإحالة'))
      }
    } catch (error) {
      logReferralDev('Failed to apply referral:', error)
      alert(t('Failed to apply referral', 'فشل في تطبيق الإحالة'))
    } finally {
      setApplyingReferral(false)
    }
  }

  async function shareReferralLink() {
    if (!stats?.referral_link) return

    if (navigator.share) {
      try {
        await navigator.share({
          title: t('Join RMS Restaurant', 'انضم إلى مطعم RMS'),
          text: t('Use my referral code for a discount!', 'استخدم رمز الإحالة الخاص بي للحصول على خصم!'),
          url: stats.referral_link,
        })
      } catch {
        // user cancelled share sheet
      }
    } else {
      try {
        await navigator.clipboard.writeText(stats.referral_link)
        alert(t('Referral link copied!', 'تم نسخ رابط الإحالة!'))
      } catch (error) {
        logReferralDev('Failed to copy:', error)
      }
    }
  }

  if (loading) {
    return (
      <div className="referral-program">
        <div className="skeleton-loader">
          <div className="skeleton" style={{ height: 120, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 80, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 100 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="referral-program">
      <div className="referral-header">
        <h2>{t('Refer & Earn', 'أحيل واربح')}</h2>
        <p>{t('Invite friends and earn rewards!', 'دعوة الأصدقاء واربح المكافآت!')}</p>
      </div>

      {referralUnavailable && (
        <div className="referral-unavailable" role="status">
          <p>
            {t(
              'The referral program is not enabled on this database yet. Ask an admin to apply pending Supabase migrations (referral RPCs), then reload.',
              'برنامج الإحالة غير مفعّل على قاعدة البيانات بعد. اطلب من المسؤول تطبيق ترحيلات Supabase المعلّقة (دوال الإحالة)، ثم أعد التحميل.',
            )}
          </p>
        </div>
      )}

      {/* Referral Code Section */}
      {!referralUnavailable &&
        (stats?.referral_code ? (
          <div className="referral-code-section">
            <h3>{t('Your Referral Code', 'رمز الإحالة الخاص بك')}</h3>
            <div className="code-display">
              <span className="code">{stats.referral_code}</span>
              <button
                type="button"
                className="copy-btn"
                onClick={() => void navigator.clipboard.writeText(stats.referral_code)}
              >
                {t('Copy', 'نسخ')}
              </button>
            </div>

            <div className="referral-link">
              <p>{t('Share this link:', 'شارك هذا الرابط:')}</p>
              <div className="link-display">
                <span className="link">{stats.referral_link}</span>
                <button type="button" className="share-btn" onClick={() => void shareReferralLink()}>
                  {t('Share', 'مشاركة')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="generate-code-section">
            <p>{t('Create your referral code to start earning!', 'أنشئ رمز الإحالة الخاص بك لبدء الربح!')}</p>
            {generateBlocked && (
              <p className="referral-inline-error">
                {t('Could not create a code. Try again later.', 'تعذر إنشاء الرمز. حاول لاحقاً.')}
              </p>
            )}
            <button type="button" className="generate-btn" onClick={() => void generateReferralCode()}>
              {t('Generate Referral Code', 'إنشاء رمز الإحالة')}
            </button>
          </div>
        ))}

      {/* Referral Stats */}
      {!referralUnavailable && stats && (
        <div className="referral-stats">
          <h3>{t('Your Referral Stats', 'إحصائيات الإحالة الخاصة بك')}</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{stats.total_referrals}</span>
              <span className="stat-label">{t('Total Referrals', 'إجمالي الإحالات')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.active_referrals}</span>
              <span className="stat-label">{t('Active This Month', 'نشط هذا الشهر')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">QAR {stats.total_rewards.toFixed(2)}</span>
              <span className="stat-label">{t('Total Earned', 'إجمالي المكتسب')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">QAR {stats.pending_rewards.toFixed(2)}</span>
              <span className="stat-label">{t('Pending Rewards', 'المكافآت المعلقة')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Apply Referral Code */}
      <div className="apply-referral-section">
        <h3>{t('Have a referral code?', 'هل لديك رمز إحالة؟')}</h3>
        <p>{t('Enter it here to get your discount', 'أدخله هنا للحصول على خصم')}</p>
        <div className="referral-input-group">
          <input
            type="text"
            value={referralInput}
            onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
            placeholder={t('Enter referral code', 'أدخل رمز الإحالة')}
            maxLength={8}
            className="referral-input"
            disabled={referralUnavailable}
          />
          <button
            type="button"
            className="apply-btn"
            onClick={() => void applyReferralCode()}
            disabled={!referralInput.trim() || applyingReferral || referralUnavailable}
          >
            {applyingReferral ? t('Applying...', 'جارٍ التطبيق...') : t('Apply Code', 'تطبيق الرمز')}
          </button>
        </div>
      </div>

      {/* How it Works */}
      <div className="how-it-works">
        <h3>{t('How It Works', 'كيف يعمل')}</h3>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>{t('Share Your Code', 'شارك رمزك')}</h4>
              <p>{t('Share your referral code with friends', 'شارك رمز الإحالة الخاص بك مع الأصدقاء')}</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>{t('Friends Order', 'يطلب الأصدقاء')}</h4>
              <p>{t('Your friends place their first order', 'يضع أصدقاؤك طلبهم الأول')}</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>{t('Both Get Rewards', 'الطرفان يحصلان على مكافآت')}</h4>
              <p>{t('You and your friend both earn rewards', 'أنت وصديقك كلاكما تكسبان مكافآت')}</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .referral-program {
          padding: 2rem;
          max-width: 600px;
          margin: 0 auto;
        }

        .referral-unavailable {
          background: var(--warning-muted, #fef3c7);
          border: 1px solid var(--warning-border, #fcd34d);
          color: var(--ink);
          border-radius: var(--radius-md);
          padding: 1rem 1.25rem;
          margin-bottom: 1.5rem;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .referral-inline-error {
          color: var(--danger, #b91c1c);
          font-size: 0.9rem;
          margin-bottom: 0.75rem;
        }

        .referral-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .referral-header h2 {
          font-size: 2rem;
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 0.5rem;
        }

        .referral-header p {
          color: var(--ink-muted);
          font-size: 1.1rem;
        }

        .referral-code-section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          margin-bottom: 2rem;
          text-align: center;
        }

        .referral-code-section h3 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .code-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .code {
          font-size: 2rem;
          font-weight: 700;
          color: var(--gold);
          letter-spacing: 0.1em;
          background: var(--cream-2);
          padding: 1rem 2rem;
          border-radius: var(--radius-md);
          border: 2px solid var(--gold);
        }

        .copy-btn, .share-btn {
          padding: 0.75rem 1.5rem;
          background: var(--gold);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .copy-btn:hover, .share-btn:hover {
          background: var(--gold-dark);
        }

        .referral-link p {
          font-weight: 500;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .link-display {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .link {
          flex: 1;
          font-size: 0.85rem;
          color: var(--ink-muted);
          background: var(--cream-2);
          padding: 0.75rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          word-break: break-all;
        }

        .generate-code-section {
          text-align: center;
          padding: 2rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          margin-bottom: 2rem;
        }

        .generate-code-section p {
          color: var(--ink-muted);
          margin-bottom: 1.5rem;
        }

        .generate-btn {
          padding: 1rem 2rem;
          background: var(--gold);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .generate-btn:hover {
          background: var(--gold-dark);
        }

        .referral-stats {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .referral-stats h3 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .stat-item {
          text-align: center;
          padding: 1rem;
          background: var(--cream-2);
          border-radius: var(--radius-sm);
        }

        .stat-value {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--gold);
          margin-bottom: 0.25rem;
        }

        .stat-label {
          font-size: 0.85rem;
          color: var(--ink-muted);
        }

        .apply-referral-section {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .apply-referral-section h3 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .apply-referral-section p {
          color: var(--ink-muted);
          margin-bottom: 1rem;
        }

        .referral-input-group {
          display: flex;
          gap: 0.5rem;
        }

        .referral-input {
          flex: 1;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 1rem;
          text-transform: uppercase;
          text-align: center;
          letter-spacing: 0.1em;
        }

        .referral-input:focus {
          outline: none;
          border-color: var(--gold);
        }

        .apply-btn {
          padding: 0.75rem 1.5rem;
          background: var(--ink);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .apply-btn:hover:not(:disabled) {
          background: var(--gold);
        }

        .apply-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .how-it-works {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
        }

        .how-it-works h3 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .steps {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .step {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .step-number {
          width: 40px;
          height: 40px;
          background: var(--gold);
          color: var(--cream);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .step-content h4 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.25rem;
        }

        .step-content p {
          color: var(--ink-muted);
          line-height: 1.5;
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
          .referral-program {
            padding: 1rem;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .referral-input-group {
            flex-direction: column;
          }

          .step {
            flex-direction: column;
            text-align: center;
          }
        }
      `}</style>
    </div>
  )
}
