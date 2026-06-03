// apps/customer/src/pages/LoginPage.tsx
import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/sessionStore'
import { MailIcon } from '../components/Icons'
import {
  buildAuthCallbackRedirectUrl,
  isAuthUserAlreadyExistsError,
  isAuthConfirmationEmailError,
  makeSignupOnlyPassword,
} from '../lib/authLoginFlow'
import { isValidEmailOtpDigitCount, normalizeEmailOtpInput } from '../lib/emailOtpFormat'
import { getEmailRedirectOrigin } from '../lib/siteUrl'
import type { OutsideDeliveryAddress } from '@rms/supabase/types'
import { useSessionStoreHydrated } from '../hooks/useSessionStoreHydrated'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_E164_RE = /^\+?[1-9]\d{1,14}$/

type AuthMode = 'signin' | 'register'

type LoginStep =
  | 'signin_email'
  | 'register_form'
  | 'wait_address_confirm'
  | 'enter_signin_ready'
  | 'wait_signin_otp'

type LocalT = (en: string, ar: string) => string

function normalizePhoneE164(raw: string, t: LocalT): string {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return ''
  const withPlus = s.startsWith('+') ? s : `+974${s}`
  if (!PHONE_E164_RE.test(withPlus)) {
    throw new Error(t('Please enter a valid phone number', 'يرجى إدخال رقم هاتف صحيح'))
  }
  return withPlus
}

function EmailConfirmTroubleshoot({ t, next }: { t: LocalT; next: string }) {
  const origin = getEmailRedirectOrigin()
  const callbackPath = `${origin}/auth/callback`
  const sampleRedirect = buildAuthCallbackRedirectUrl(next, 'signup_confirm')

  return (
    <details className="login-troubleshoot">
      <summary>{t('No email? Checklist for operators', 'لا يصل البريد؟ قائمة تحقق للمشغّلين')}</summary>
      <ul>
        <li>
          {t(
            'Supabase → Authentication → Emails: turn on “Confirm email” (or signup confirmations will not match this flow).',
            'Supabase → Authentication → Emails: فعّل «تأكيد البريد» وإلا لن تطابق رسالة التأكيد هذا المسار.'
          )}
        </li>
        <li>
          {t(
            'Authentication → SMTP: configure a real provider (Resend, SES, Postmark, …). The default sender is easy to throttle or filter.',
            'Authentication → SMTP: اضبط مزوّداً حقيقياً (Resend أو SES أو Postmark…). المرسل الافتراضي سهل أن يُقيّد أو يُصفّى.'
          )}
        </li>
        <li>
          {t(
            'Authentication → URL Configuration → Redirect URLs: allow this callback (a wildcard pattern is OK). Redeploy after changing VITE_SITE_URL:',
            'Authentication → URL Configuration → Redirect URLs: اسمح بهذا المسار (يمكن استخدام نمط أوسع). أعد النشر بعد تغيير VITE_SITE_URL:'
          )}{' '}
          <code dir="ltr">{callbackPath}</code>
        </li>
        <li>
          {t(
            'The confirmation link we request from Supabase looks like (query string may vary):',
            'رابط التأكيد الذي نطلبه من Supabase يبدو هكذا (قد تختلف معلمات الاستعلام):'
          )}{' '}
          <code dir="ltr" className="login-troubleshoot-long">
            {sampleRedirect}
          </code>
        </li>
        <li>
          {t(
            'Authentication → Logs: look for email_send failures or rate limits after you tap resend.',
            'Authentication → السجلات: ابحث عن فشل email_send أو حدود معدّل بعد الضغط على إعادة الإرسال.'
          )}
        </li>
        <li>
          {t(
            'In the inbox: check Spam, and in Gmail also Promotions / “All Mail”.',
            'في صندوق الوارد: راجع الرسائل غير المرغوب فيها، وفي Gmail أيضاً «الترويجات» أو «كل الرسائل».'
          )}
        </li>
      </ul>
    </details>
  )
}

export default function LoginPage() {
  const { language, syncFromAuthUser, setPhone, setCustomerName, setDeliveryAddress } = useSessionStore()
  const sessionHydrated = useSessionStoreHydrated()
  const navigate = useNavigate()
  const sentEmailRef = useRef('')
  const [sentToEmail, setSentToEmail] = useState('')
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') // 'admin' or 'driver'
  const nextRaw = searchParams.get('next') || '/menu'
  const next = nextRaw.startsWith('/') ? nextRaw : '/menu'
  const authErrorCode = searchParams.get('auth_error')
  const authMsgRaw = searchParams.get('auth_msg')
  const t: LocalT = (en, ar) => (language === 'ar' ? ar : en)

  const authMsgDecoded =
    authMsgRaw !== null
      ? (() => {
          try {
            return decodeURIComponent(authMsgRaw.replace(/\+/g, ' '))
          } catch {
            return authMsgRaw
          }
        })()
      : null

  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [loginStep, setLoginStep] = useState<LoginStep>('signin_email')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhoneLocal] = useState('')
  const [street, setStreet] = useState('')
  const [building, setBuilding] = useState('')
  const [area, setArea] = useState('')
  const [city, setCity] = useState('Doha')
  const [floor, setFloor] = useState('')
  const [apartment, setApartment] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const canSwitchAuthMode = loginStep === 'signin_email' || loginStep === 'register_form'

  /** Skip login when Supabase session is already valid (e.g. app relaunch or return from background). */
  useEffect(() => {
    if (!sessionHydrated) return
    let cancelled = false
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return
      navigate(next, { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [sessionHydrated, navigate, next])

  useEffect(() => {
    const step = searchParams.get('step')
    const em = searchParams.get('email')
    if (step === 'signin_otp' && typeof em === 'string' && EMAIL_RE.test(em.trim())) {
      const e = em.trim().toLowerCase()
      setAuthMode('signin')
      setEmail(e)
      sentEmailRef.current = e
      setSentToEmail(e)
      setLoginStep('enter_signin_ready')
      setError(null)
      setNotice(null)
    }
  }, [searchParams])

  function persistCheckoutProfileFromForm(phoneE164: string, fullName: string, addr: OutsideDeliveryAddress) {
    setPhone(phoneE164)
    setCustomerName(fullName)
    setDeliveryAddress(addr)
  }

  async function sendSignInOtpToEmail(trimmed: string) {
    const redirectMagic = buildAuthCallbackRedirectUrl(next, 'magic')
    const { error: signErr } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: redirectMagic,
        shouldCreateUser: false,
      },
    })
    if (signErr) throw signErr
    sentEmailRef.current = trimmed
    setSentToEmail(trimmed)
    setLoginStep('wait_signin_otp')
    setOtpCode('')
  }

  async function submitSignInEmail(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setNotice(null)
      setError(t('Please enter a valid email address', 'يرجى إدخال بريد إلكتروني صالح'))
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await sendSignInOtpToEmail(trimmed)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const lower = raw.toLowerCase()
      const looksUnknown =
        lower.includes('user not found') ||
        lower.includes('signups not allowed') ||
        lower.includes('invalid login credentials') ||
        lower.includes('email not confirmed')
      setError(
        looksUnknown
          ? t(
              'No passwordless sign-in is available for this email yet. Use “Create account” to register, or confirm your email if you already signed up.',
              'لا يوجد تسجيل دخول بدون كلمة مرور لهذا البريد بعد. استخدم «إنشاء حساب» للتسجيل، أو أكّد بريدك إن كنت قد سجّلت مسبقاً.'
            )
          : raw
      )
    } finally {
      setLoading(false)
    }
  }

  async function submitRegistration(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setNotice(null)
      setError(t('Please enter a valid email address', 'يرجى إدخال بريد إلكتروني صالح'))
      return
    }
    const fn = firstName.trim()
    const ln = lastName.trim()
    if (!fn || !ln) {
      setError(t('Please enter your first and last name', 'يرجى إدخال الاسم الأول واسم العائلة'))
      return
    }
    if (!street.trim() || !building.trim() || !area.trim()) {
      setError(t('Please fill in street, building, and district', 'يرجى تعبئة الشارع والمبنى والمنطقة'))
      return
    }
    let phoneE164: string
    try {
      phoneE164 = normalizePhoneE164(phone, t)
    } catch (pe) {
      setError(pe instanceof Error ? pe.message : t('Invalid phone', 'هاتف غير صالح'))
      return
    }

    const addr: OutsideDeliveryAddress = {
      street: street.trim(),
      building: building.trim(),
      area: area.trim(),
      city: city.trim() || 'Doha',
      ...(floor.trim() ? { floor: floor.trim() } : {}),
      ...(apartment.trim() ? { apartment: apartment.trim() } : {}),
    }
    const fullName = `${fn} ${ln}`.trim()

    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const redirectSignup = buildAuthCallbackRedirectUrl(next, 'signup_confirm')
      const { data, error: signErr } = await supabase.auth.signUp({
        email: trimmed,
        password: makeSignupOnlyPassword(),
        options: {
          emailRedirectTo: redirectSignup,
          data: {
            first_name: fn,
            last_name: ln,
            full_name: fullName,
            phone_e164: phoneE164,
            delivery_address: {
              street: addr.street,
              building: addr.building,
              area: addr.area,
              city: addr.city,
              ...(addr.floor ? { floor: addr.floor } : {}),
              ...(addr.apartment ? { apartment: addr.apartment } : {}),
            },
          },
        },
      })

      if (signErr) {
        if (isAuthUserAlreadyExistsError(signErr)) {
          persistCheckoutProfileFromForm(phoneE164, fullName, addr)
          await sendSignInOtpToEmail(trimmed)
          setNotice(
            t(
              'This email is already registered. We sent a sign-in email (code or link) instead. Your details were saved for checkout.',
              'هذا البريد مسجّل مسبقاً. أرسلنا بريد تسجيل دخول (رمز أو رابط) بدلاً من ذلك. حُفظت بياناتك للدفع لاحقاً.'
            )
          )
          return
        }
        if (isAuthConfirmationEmailError(signErr)) {
          throw new Error(
            t(
              'We could not send the confirmation email. The site owner must configure Supabase Authentication → SMTP (for example Resend) with a verified sender for maazym.com.',
              'تعذّر إرسال رسالة التأكيد. يجب على مسؤول الموقع ضبط Supabase → Authentication → SMTP (مثل Resend) مع بريد مرسل موثّق لـ maazym.com.'
            )
          )
        }
        throw signErr
      }

      persistCheckoutProfileFromForm(phoneE164, fullName, addr)

      if (data.session?.user) {
        await supabase.auth.signOut()
        useSessionStore.getState().clearAuth()
        sentEmailRef.current = trimmed
        setSentToEmail(trimmed)
        setLoginStep('enter_signin_ready')
        setNotice(
          t(
            'This project confirms email automatically. Use “Send sign-in code” below to receive your login email.',
            'هذا المشروع يؤكد البريد تلقائياً. استخدم «إرسال رمز الدخول» أدناه لاستلام بريد تسجيل الدخول.'
          )
        )
        return
      }

      sentEmailRef.current = trimmed
      setSentToEmail(trimmed)
      setLoginStep('wait_address_confirm')
    } catch (err) {
      const msg = isAuthConfirmationEmailError(err)
        ? err instanceof Error
          ? err.message
          : t('Could not send verification email', 'تعذّر إرسال رسالة التحقق')
        : err instanceof Error
          ? err.message
          : t('Could not send verification email', 'تعذّر إرسال رسالة التحقق')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function resendSignupEmail() {
    const addr = sentEmailRef.current || email.trim().toLowerCase()
    if (!addr || !EMAIL_RE.test(addr)) return
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: addr })
      if (resendErr) throw resendErr
      setNotice(
        t('Another confirmation email was sent. Check your inbox and spam folder.', 'أُعيد إرسال رسالة التأكيد. راجع البريد ومجلد الرسائل غير المرغوب فيها.')
      )
    } catch (err) {
      setNotice(null)
      setError(err instanceof Error ? err.message : t('Could not resend email', 'تعذّر إعادة الإرسال'))
    } finally {
      setLoading(false)
    }
  }

  async function onSendSignInCode(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = sentEmailRef.current || email.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      setNotice(null)
      setError(t('Please enter a valid email address', 'يرجى إدخال بريد إلكتروني صالح'))
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await sendSignInOtpToEmail(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not send sign-in email', 'تعذّر إرسال بريد الدخول'))
    } finally {
      setLoading(false)
    }
  }

  async function verifyEmailCode(e: FormEvent) {
    e.preventDefault()
    const addr = sentEmailRef.current || email.trim().toLowerCase()
    const digits = normalizeEmailOtpInput(otpCode)
    if (!addr || !isValidEmailOtpDigitCount(digits)) {
      setNotice(null)
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
    setNotice(null)
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: addr,
        token: digits,
        type: 'email',
      })
      if (verifyErr) throw verifyErr
      if (data.session?.user) {
        syncFromAuthUser(data.session.user)
        navigate(next.startsWith('/') ? next : '/menu', { replace: true })
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t('Invalid or expired code. Request a new email below.', 'رمز غير صالح أو منتهٍ. اطلب بريداً جديداً.')
      setError(msg)
    } finally {
      setVerifyLoading(false)
    }
  }

  function selectAuthMode(mode: AuthMode) {
    if (!canSwitchAuthMode) return
    setError(null)
    setNotice(null)
    setOtpCode('')
    sentEmailRef.current = ''
    setSentToEmail('')
    setAuthMode(mode)
    setLoginStep(mode === 'signin' ? 'signin_email' : 'register_form')
  }

  function resetToEmailEntry() {
    setOtpCode('')
    sentEmailRef.current = ''
    setSentToEmail('')
    setError(null)
    setNotice(null)
    if (authMode === 'register') {
      setLoginStep('register_form')
    } else {
      setLoginStep('signin_email')
    }
  }

  const title =
    role === 'admin'
      ? t('Admin Portal Login', 'دخول بوابة المسؤول')
      : role === 'driver'
        ? t('Driver App Login', 'دخول تطبيق السائق')
        : loginStep === 'signin_email' || loginStep === 'register_form'
          ? authMode === 'signin'
            ? t('Sign in', 'تسجيل الدخول')
            : t('Create account', 'إنشاء حساب')
          : loginStep === 'wait_address_confirm'
            ? t('Verify your email address', 'تحقق من عنوان بريدك')
            : loginStep === 'enter_signin_ready'
              ? t('Request sign-in code', 'اطلب رمز الدخول')
              : t('Check your email', 'راجع بريدك الإلكتروني')

  const subtitle =
    role === 'admin'
      ? t('Authorized personnel only. Enter your admin email to proceed.', 'للموظفين المصرح لهم فقط. أدخل بريدك الإلكتروني للمتابعة.')
      : role === 'driver'
        ? t('Driver access only. Enter your registered driver email.', 'دخول السائقين فقط. أدخل بريدك الإلكتروني المسجل.')
        : loginStep === 'signin_email'
          ? t(
              'Enter your email and we will send a one-time code or magic link. New here? Switch to “Create account”.',
              'أدخل بريدك لنرسل رمزاً لمرة واحدة أو رابط تسجيل دخول. جديد؟ انتقل إلى «إنشاء حساب».'
            )
          : loginStep === 'register_form'
        ? t(
            'Register with your details so checkout is faster later. We will email you a link to confirm your address, then you can request a sign-in code.',
            'سجّل بياناتك لتسريع الدفع لاحقاً. سنرسل رابطاً لتأكيد بريدك، ثم يمكنك طلب رمز الدخول.'
          )
        : loginStep === 'wait_address_confirm'
          ? t(
              `We sent a confirmation link to ${sentToEmail || email.trim()}. Open that email and tap “Confirm” (or the equivalent). If nothing arrives within a few minutes, check spam and your Supabase Auth / SMTP settings.`,
              `أرسلنا رابط تأكيد إلى ${sentToEmail || email.trim()}. افتح الرسالة واضغط «تأكيد» أو ما يعادله. إذا لم يصل شيء خلال دقائق، راجع البريد المزعج وإعدادات Supabase Auth / SMTP.`
            )
          : loginStep === 'enter_signin_ready'
            ? t(
                'Your address is confirmed. Now send a one-time sign-in email—it can include a numeric code and/or a magic link.',
                'تم تأكيد عنوانك. أرسل الآن بريد دخول لمرة واحدة—قد يتضمن رمزاً رقمياً و/أو رابط تسجيل دخول.'
              )
            : t(
                'Use the magic link in the message if you can. Otherwise enter the numeric code (often 6–8 digits).',
                'استخدم رابط تسجيل الدخول في الرسالة إن أمكن. وإلا أدخل الرمز الرقمي (غالباً 6–8 أرقام).'
              )

  const cardClassName =
    loginStep === 'register_form' ? 'login-card login-card-wide' : 'login-card'

  return (
    <div className="login-page">
      <div className={cardClassName}>
        <div className="login-icon" aria-hidden>
          <MailIcon />
        </div>
        <h1 className="login-title">{title}</h1>
        <p className="login-sub">{subtitle}</p>

        {canSwitchAuthMode && !role ? (
          <div className="login-mode-switch" role="tablist" aria-label={t('Sign in or register', 'تسجيل الدخول أو التسجيل')}>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'signin'}
              className={`login-mode-btn ${authMode === 'signin' ? 'active' : ''}`}
              onClick={() => selectAuthMode('signin')}
            >
              {t('Sign in', 'تسجيل الدخول')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'register'}
              className={`login-mode-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => selectAuthMode('register')}
            >
              {t('Create account', 'إنشاء حساب')}
            </button>
          </div>
        ) : null}

        {authErrorCode && (
          <div className="login-error" role="alert">
            {authErrorCode === 'otp_expired'
              ? t(
                  'That sign-in link expired or was already used. Request a new link below.',
                  'انتهت صلاحية رابط تسجيل الدخول أو تم استخدامه مسبقاً. اطلب رابطاً جديداً أدناه.'
                )
              : authMsgDecoded ||
                t(
                  'Verification could not be completed. Try requesting a new email.',
                  'تعذّر إكمال التحقق. جرّب طلب بريد جديد.'
                )}
          </div>
        )}

        {notice && (
          <div className="login-notice" role="status">
            {notice}
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        {loginStep === 'signin_email' ? (
          <form onSubmit={submitSignInEmail} className="login-form">
            <label htmlFor="login-email">{t('Email', 'البريد الإلكتروني')}</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('you@example.com', 'you@example.com')}
              className="login-input"
              dir="ltr"
            />
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? t('Sending…', 'جارٍ الإرسال…') : t('Send verification code', 'إرسال رمز التحقق')}
            </button>
          </form>
        ) : null}

        {loginStep === 'register_form' ? (
          <form onSubmit={submitRegistration} className="login-form login-register-form">
            <label htmlFor="reg-email">{t('Email', 'البريد الإلكتروني')}</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('you@example.com', 'you@example.com')}
              className="login-input"
              dir="ltr"
            />
            <div className="login-field-row">
              <div className="login-field-half">
                <label htmlFor="reg-first">{t('First name', 'الاسم الأول')}</label>
                <input
                  id="reg-first"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="login-input"
                />
              </div>
              <div className="login-field-half">
                <label htmlFor="reg-last">{t('Last name', 'اسم العائلة')}</label>
                <input
                  id="reg-last"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="login-input"
                />
              </div>
            </div>
            <label htmlFor="reg-phone">{t('Mobile number', 'رقم الجوال')}</label>
            <input
              id="reg-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhoneLocal(e.target.value)}
              placeholder={t('+974… or local number', '+974… أو الرقم المحلي')}
              className="login-input"
              dir="ltr"
            />
            <p className="login-hint">{t('Include country code, or we default to +974.', 'ضمّن مفتاح الدولة، أو نستخدم +974 افتراضياً.')}</p>
            <label htmlFor="reg-street">{t('Street', 'الشارع')} *</label>
            <input
              id="reg-street"
              type="text"
              autoComplete="street-address"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="login-input"
            />
            <div className="login-field-row">
              <div className="login-field-half">
                <label htmlFor="reg-building">{t('Building', 'المبنى')} *</label>
                <input
                  id="reg-building"
                  type="text"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  className="login-input"
                />
              </div>
              <div className="login-field-half">
                <label htmlFor="reg-area">{t('District', 'المنطقة')} *</label>
                <input
                  id="reg-area"
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="login-input"
                />
              </div>
            </div>
            <div className="login-field-row">
              <div className="login-field-half">
                <label htmlFor="reg-city">{t('City', 'المدينة')}</label>
                <input
                  id="reg-city"
                  type="text"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="login-input"
                />
              </div>
              <div className="login-field-half">
                <label htmlFor="reg-floor">{t('Floor', 'الطابق')}</label>
                <input
                  id="reg-floor"
                  type="text"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className="login-input"
                />
              </div>
            </div>
            <label htmlFor="reg-apt">{t('Suite / apartment', 'الشقة')}</label>
            <input
              id="reg-apt"
              type="text"
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
              className="login-input"
            />
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? t('Sending…', 'جارٍ الإرسال…') : t('Send address confirmation', 'إرسال تأكيد العنوان')}
            </button>
          </form>
        ) : null}

        {loginStep === 'wait_address_confirm' ? (
          <div className="login-sent-block">
            <button type="button" className="login-btn" onClick={() => void resendSignupEmail()} disabled={loading}>
              {loading ? t('Sending…', 'جارٍ الإرسال…') : t('Resend confirmation email', 'إعادة إرسال رسالة التأكيد')}
            </button>
            <button type="button" className="login-change-email" onClick={resetToEmailEntry}>
              {t('Edit details or use a different email', 'تعديل البيانات أو بريد آخر')}
            </button>
            <EmailConfirmTroubleshoot t={t} next={next} />
          </div>
        ) : null}

        {loginStep === 'enter_signin_ready' ? (
          <div className="login-sent-block">
            <p className="login-sent" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {sentToEmail || email.trim()}
            </p>
            <button type="button" className="login-btn" onClick={(e) => void onSendSignInCode(e)} disabled={loading}>
              {loading ? t('Sending…', 'جارٍ الإرسال…') : t('Send sign-in code', 'إرسال رمز الدخول')}
            </button>
            <button type="button" className="login-change-email" onClick={resetToEmailEntry}>
              {authMode === 'register'
                ? t('Edit details or use a different email', 'تعديل البيانات أو بريد آخر')
                : t('Use a different email', 'استخدام بريد آخر')}
            </button>
          </div>
        ) : null}

        {loginStep === 'wait_signin_otp' ? (
          <div className="login-sent-block">
            <p className="login-sent">
              {t(
                `Sign-in message sent to ${sentToEmail || email.trim()}.`,
                `أُرسل بريد الدخول إلى ${sentToEmail || email.trim()}.`
              )}
            </p>
            <form onSubmit={verifyEmailCode} className="login-form login-otp-form">
              <label htmlFor="login-email-code">{t('Numeric code (if not using the link)', 'الرمز الرقمي (إن لم تستخدم الرابط)')}</label>
              <input
                id="login-email-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(normalizeEmailOtpInput(e.target.value))}
                placeholder={t('6–8 digit code from email', 'رمز من 6–8 أرقام من البريد')}
                className="login-input"
                dir="ltr"
              />
              <button type="submit" className="login-btn" disabled={verifyLoading}>
                {verifyLoading ? t('Verifying…', 'جارٍ التحقق…') : t('Verify code', 'تحقق من الرمز')}
              </button>
            </form>
            <button type="button" className="login-change-email" onClick={() => void onSendSignInCode()}>
              {t('Resend sign-in email', 'إعادة إرسال بريد الدخول')}
            </button>
            <button type="button" className="login-change-email" onClick={resetToEmailEntry}>
              {t('Use a different email', 'استخدام بريد آخر')}
            </button>
          </div>
        ) : null}

        <Link to="/menu" className="login-back">
          {t('Back to menu', 'العودة إلى القائمة')}
        </Link>
      </div>

      <style>{`
        .login-page {
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
          background: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(184, 151, 90, 0.1), transparent 60%);
        }
        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 2rem;
          background: var(--surface-elevated);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md), 0 0 0 1px rgba(184, 151, 90, 0.06);
          transition: box-shadow var(--transition), border-color var(--transition);
        }
        .login-card-wide {
          max-width: 520px;
        }
        @media (hover: hover) {
          .login-card:hover {
            box-shadow: var(--shadow-lg), 0 0 0 1px rgba(184, 151, 90, 0.1);
          }
        }
        .login-mode-switch {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }
        .login-mode-btn {
          flex: 1;
          padding: 0.55rem 0.75rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--cream);
          color: var(--ink-muted);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: background var(--transition), color var(--transition), border-color var(--transition);
        }
        .login-mode-btn.active {
          background: var(--ink);
          color: var(--cream);
          border-color: var(--ink);
        }
        .login-mode-btn:hover:not(.active) {
          border-color: var(--gold);
          color: var(--ink);
        }
        .login-icon {
          width: 3rem;
          height: 3rem;
          margin: 0 auto 1rem;
          color: var(--gold);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-icon svg { width: 2.5rem; height: 2.5rem; }
        .login-title {
          font-family: var(--font-display);
          font-size: 1.75rem;
          font-weight: 300;
          text-align: center;
          margin-bottom: 0.75rem;
          color: var(--ink);
        }
        .login-sub {
          font-size: 0.875rem;
          color: var(--ink-muted);
          line-height: 1.55;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        .login-error {
          background: var(--danger-muted);
          border: 1px solid rgba(185, 28, 28, 0.35);
          border-radius: var(--radius-sm);
          padding: 0.65rem 0.85rem;
          font-size: 0.82rem;
          color: var(--danger);
          margin-bottom: 1rem;
        }
        [data-theme="dark"] .login-error {
          border-color: rgba(248, 113, 113, 0.45);
          color: var(--danger);
        }
        .login-notice {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.35);
          border-radius: var(--radius-sm);
          padding: 0.65rem 0.85rem;
          font-size: 0.82rem;
          color: var(--success, #166534);
          margin-bottom: 1rem;
        }
        [data-theme="dark"] .login-notice {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(74, 222, 128, 0.4);
          color: #86efac;
        }
        .login-troubleshoot {
          margin-top: 0.25rem;
          font-size: 0.8rem;
          color: var(--ink-muted);
          line-height: 1.5;
        }
        .login-troubleshoot summary {
          cursor: pointer;
          color: var(--gold);
          font-weight: 500;
          list-style: none;
        }
        .login-troubleshoot summary::-webkit-details-marker {
          display: none;
        }
        .login-troubleshoot[open] summary {
          margin-bottom: 0.5rem;
        }
        .login-troubleshoot ul {
          margin: 0;
          padding-inline-start: 1.2rem;
        }
        .login-troubleshoot li {
          margin-bottom: 0.55rem;
        }
        .login-troubleshoot li:last-child {
          margin-bottom: 0;
        }
        .login-troubleshoot code {
          display: inline-block;
          max-width: 100%;
          font-size: 0.72rem;
          word-break: break-all;
          background: var(--surface, rgba(0, 0, 0, 0.04));
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
          margin-top: 0.2rem;
        }
        .login-troubleshoot code.login-troubleshoot-long {
          display: block;
          margin-top: 0.35rem;
        }
        .login-sent-block {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .login-sent {
          font-size: 0.9rem;
          color: var(--ink);
          line-height: 1.5;
          text-align: center;
          margin: 0;
        }
        .login-otp-form {
          margin-bottom: 0;
        }
        .login-change-email {
          background: none;
          border: none;
          font-size: 0.85rem;
          color: var(--ink-muted);
          cursor: pointer;
          text-decoration: underline;
          align-self: center;
          padding: 0.25rem;
        }
        .login-change-email:hover {
          color: var(--gold);
        }
        .login-form label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink-muted);
          margin-bottom: 0.35rem;
        }
        .login-register-form .login-input {
          margin-bottom: 0.75rem;
        }
        .login-register-form .login-btn {
          margin-top: 0.35rem;
        }
        .login-field-row {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .login-field-half {
          flex: 1;
          min-width: 8rem;
        }
        .login-field-half .login-input {
          margin-bottom: 0.75rem;
        }
        .login-hint {
          font-size: 0.78rem;
          color: var(--ink-muted);
          margin: -0.35rem 0 0.65rem;
          line-height: 1.4;
        }
        .login-input {
          width: 100%;
          padding: 0.65rem 0.85rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          font-size: 0.95rem;
          background: var(--cream);
          margin-bottom: 1rem;
        }
        .login-input:focus {
          outline: none;
          border-color: var(--gold);
          box-shadow: 0 0 0 3px var(--focus-ring);
        }
        .login-btn {
          width: 100%;
          padding: 0.85rem;
          border: none;
          border-radius: var(--radius-md);
          background: var(--ink);
          color: var(--cream);
          font-size: 0.92rem;
          font-weight: 500;
          cursor: pointer;
          transition: background var(--transition), color var(--transition), transform 0.2s var(--ease-out-luxe), box-shadow var(--transition);
        }
        .login-btn:hover:not(:disabled) {
          background: var(--gold);
          color: var(--ink);
          box-shadow: 0 6px 20px rgba(184, 151, 90, 0.35);
        }
        .login-btn:active:not(:disabled) {
          transform: scale(0.99);
        }
        @media (prefers-reduced-motion: reduce) {
          .login-btn:active:not(:disabled) {
            transform: none;
          }
          .login-card {
            transition: none;
          }
        }
        .login-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .login-back {
          display: block;
          text-align: center;
          margin-top: 1.25rem;
          font-size: 0.85rem;
          color: var(--ink-muted);
          text-decoration: none;
        }
        .login-back:hover { color: var(--gold); }
      `}</style>
    </div>
  )
}
