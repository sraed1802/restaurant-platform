// apps/customer/src/pages/OtpPage.tsx
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { useCartStore } from '../store/cartStore'
import { MailIcon } from '../components/Icons'
import { getEmailRedirectOrigin } from '../lib/siteUrl'
import { isValidEmailOtpDigitCount, normalizeEmailOtpInput } from '../lib/emailOtpFormat'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function OtpPage() {
  const navigate = useNavigate()
  const { language, customerEmail, pendingOrderId, syncFromAuthUser } = useSessionStore()
  const clearCart = useCartStore((s) => s.clearCart)

  const [email, setEmail] = useState(() => customerEmail ?? '')
  const [sentToEmail, setSentToEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  useEffect(() => {
    setEmail((prev) => (prev.trim() === '' && customerEmail ? customerEmail : prev))
  }, [customerEmail])

  useEffect(() => {
    if (!pendingOrderId) {
      navigate('/menu', { replace: true })
    }
  }, [pendingOrderId, navigate])
 
  useEffect(() => {
    // When the user submits/changes state, keep the form centered in view (footer can be tall).
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [sent, loading, verifyLoading, error])

  async function sendEmailOtp(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!pendingOrderId) return
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('Please enter a valid email address', 'يرجى إدخال بريد إلكتروني صالح'))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const redirectUrl = new URL('/auth/callback', getEmailRedirectOrigin())
      redirectUrl.searchParams.set('next', `/track/${pendingOrderId}`)

      const { error: signErr } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectUrl.toString(),
          shouldCreateUser: true,
        },
      })
      if (signErr) throw signErr
      setSentToEmail(trimmed)
      setSent(true)
      setCode('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('Could not send verification email', 'تعذّر إرسال رسالة التحقق')
      )
    } finally {
      setLoading(false)
    }
  }

  async function verifyEmailCode(e: FormEvent) {
    e.preventDefault()
    const addr = sentToEmail || email.trim().toLowerCase()
    const digits = normalizeEmailOtpInput(code)
    if (!pendingOrderId || !addr || !isValidEmailOtpDigitCount(digits)) {
      setError(
        t(
          'Enter the full numeric code from your email (6–8 digits, depending on your project settings).',
          'أدخل الرمز الرقمي كاملاً من بريدك (6–8 أرقام حسب إعدادات المشروع).'
        )
      )
      return
    }

    setVerifyLoading(true)
    setError(null)
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: addr,
        token: digits,
        type: 'email',
      })
      if (verifyErr) throw verifyErr
      const user = data.session?.user ?? data.user
      if (user) {
        syncFromAuthUser(user)
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) {
          await supabase.functions.invoke('claim-order-email', {
            body: { order_id: pendingOrderId },
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        }
        clearCart()
        navigate(`/track/${pendingOrderId}`, { replace: true })
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Invalid or expired code. Request a new email.', 'رمز غير صالح أو منتهٍ. اطلب بريداً جديداً.')
      )
    } finally {
      setVerifyLoading(false)
    }
  }

  if (!pendingOrderId) {
    return null
  }

  return (
    <div className="otp-page">
      <div className="otp-icon" aria-hidden>
        <MailIcon />
      </div>
      <h1 className="otp-title">
        {sent
          ? t('Check your email', 'راجع بريدك الإلكتروني')
          : t('Confirm your email', 'أكّد بريدك الإلكتروني')}
      </h1>
      <p className="otp-subtitle">
        {sent
          ? t(
              `We sent a message to ${sentToEmail}. Open the email and tap the verification link first. If you only see a numeric code, enter every digit below (often 6–8 digits).`,
              `أرسلنا رسالة إلى ${sentToEmail}. افتح الرسالة واضغط رابط التحقق أولاً. إذا ظهر رقم فقط فأدخل كل الأرقام أدناه (غالباً 6–8 أرقام).`
            )
          : t(
              'Enter the email address where we should send your verification link. Open the link in that email to confirm this order; a numeric code may also appear in the same message.',
              'أدخل البريد الذي نرسل إليه رابط التحقق. افتح الرابط في الرسالة لتأكيد الطلب؛ قد يظهر رمز رقمي في نفس الرسالة.'
            )}
      </p>

      {error && <div className="otp-error">{error}</div>}

      {!sent ? (
        <form onSubmit={sendEmailOtp} className="otp-form">
          <label htmlFor="verify-email">{t('Email', 'البريد الإلكتروني')}</label>
          <input
            id="verify-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('you@example.com', 'you@example.com')}
            className="otp-email-input"
            dir="ltr"
          />
          <button type="submit" className="otp-btn primary" disabled={loading}>
            {loading ? t('Sending…', 'جارٍ الإرسال…') : t('Send verification email', 'إرسال رسالة التحقق')}
          </button>
        </form>
      ) : (
        <>
          <form onSubmit={verifyEmailCode} className="otp-form otp-verify-form">
            <label htmlFor="verify-code">{t('Numeric code (if not using the link)', 'الرمز الرقمي (إن لم تستخدم الرابط)')}</label>
            <input
              id="verify-code"
              className="otp-input"
              value={code}
              onChange={(e) => setCode(normalizeEmailOtpInput(e.target.value))}
              placeholder={t('6–8 digit code from email', 'رمز من 6–8 أرقام من البريد')}
              dir="ltr"
              maxLength={12}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <button
              type="submit"
              className="otp-btn primary"
              disabled={verifyLoading || !isValidEmailOtpDigitCount(code)}
            >
              {verifyLoading ? t('Verifying…', 'جارٍ التحقق…') : t('Confirm order', 'تأكيد الطلب')}
            </button>
          </form>
          <button
            type="button"
            className="otp-btn ghost"
            onClick={() => {
              void sendEmailOtp()
            }}
            disabled={loading}
          >
            {t('Resend email', 'إعادة إرسال البريد')}
          </button>
          <button
            type="button"
            className="otp-change-email"
            onClick={() => {
              setSent(false)
              setCode('')
              setSentToEmail('')
              setError(null)
            }}
          >
            {t('Use a different email', 'استخدام بريد آخر')}
          </button>
        </>
      )}

      <style>{`
        .otp-page {
          max-width: 420px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem 2.5rem;
          text-align: center;
          min-height: calc(100dvh - 8rem);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .otp-icon {
          width: 3rem;
          height: 3rem;
          margin: 0 auto 1.25rem;
          color: var(--gold);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .otp-icon svg { width: 2.5rem; height: 2.5rem; }
        .otp-title {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 300;
          margin-bottom: 0.75rem;
          color: var(--ink);
        }
        .otp-subtitle {
          font-size: 0.875rem;
          color: var(--ink-muted);
          margin-bottom: 2rem;
          line-height: 1.6;
        }
        .otp-error {
          background: var(--danger-muted);
          border: 1px solid var(--danger-border);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          color: var(--danger);
          margin-bottom: 1.25rem;
          text-align: start;
        }
        .otp-form {
          text-align: start;
        }
        .otp-form label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink-muted);
          margin-bottom: 0.35rem;
        }
        .otp-email-input {
          width: 100%;
          padding: 0.65rem 0.85rem;
          border-radius: 8px;
          border: 2px solid var(--border);
          font-size: 0.95rem;
          background: var(--cream);
          margin-bottom: 1rem;
          transition: border-color var(--transition);
        }
        .otp-email-input:focus {
          outline: none;
          border-color: var(--gold);
        }
        .otp-input {
          font-size: 2rem;
          letter-spacing: 0.4em;
          font-weight: 700;
          text-align: center;
          width: 100%;
          padding: 1rem;
          border-radius: 8px;
          border: 2px solid var(--border);
          margin-bottom: 1rem;
          transition: border-color var(--transition);
        }
        .otp-input:focus {
          border-color: var(--gold);
        }
        .otp-btn {
          width: 100%;
          padding: 1rem;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 500;
          margin-bottom: 0.75rem;
          transition: all var(--transition);
        }
        .otp-btn.primary {
          background: var(--ink);
          color: var(--cream);
          border: none;
          cursor: pointer;
        }
        .otp-btn.primary:hover:not(:disabled) {
          background: var(--gold);
        }
        .otp-btn.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .otp-btn.ghost {
          background: none;
          color: var(--ink-muted);
          font-size: 0.82rem;
          border: none;
          cursor: pointer;
        }
        .otp-btn.ghost:hover:not(:disabled) {
          color: var(--ink);
        }
        .otp-change-email {
          background: none;
          border: none;
          font-size: 0.85rem;
          color: var(--ink-muted);
          cursor: pointer;
          text-decoration: underline;
          padding: 0.25rem;
        }
        .otp-change-email:hover {
          color: var(--gold);
        }
      `}</style>
    </div>
  )
}
