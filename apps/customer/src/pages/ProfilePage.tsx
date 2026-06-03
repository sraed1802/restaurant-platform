// apps/customer/src/pages/ProfilePage.tsx
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../store/sessionStore'
import type { OutsideDeliveryAddress } from '@rms/supabase/types'
import { isHotelRoomDeliveryAddress } from '@rms/supabase/fulfillment'
import { supabase } from '../lib/supabase'
import { fetchCustomerProfileRow, updateCustomerProfile } from '../services/customerProfile'
import { deleteCustomerAccount } from '../services/deleteCustomerAccount'
import { PRIVACY_DELETION_EMAIL } from '../content/legalCopy'
import { useSessionStoreHydrated } from '../hooks/useSessionStoreHydrated'
import { useCartStore } from '../store/cartStore'

function newBlankAddress(): OutsideDeliveryAddress {
  return {
    id: crypto.randomUUID(),
    street: '',
    building: '',
    floor: '',
    apartment: '',
    area: '',
    city: 'Doha',
    is_default: false,
  }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const sessionHydrated = useSessionStoreHydrated()
  const { language, customerId, customerEmail, customerName, phone, setPhone, setCustomerName, setDeliveryAddress } =
    useSessionStore()
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  const [name, setName] = useState('')
  const [phoneLocal, setPhoneLocal] = useState('')
  const [addresses, setAddresses] = useState<OutsideDeliveryAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionHydrated) return
    if (!customerId) {
      navigate(`/login?next=${encodeURIComponent('/profile')}`, { replace: true })
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchCustomerProfileRow(customerId).then((row) => {
      if (cancelled || !row) return
      setName(row.name ?? customerName ?? '')
      setPhoneLocal(row.phone_e164 ?? phone ?? '')
      const list = (row.delivery_addresses ?? []).filter((a) => !isHotelRoomDeliveryAddress(a)) as OutsideDeliveryAddress[]
      const withIds = list.map((a) => ({ ...a, id: a.id ?? crypto.randomUUID() }))
      setAddresses(withIds.length > 0 ? withIds : [newBlankAddress()])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [sessionHydrated, customerId, customerName, navigate, phone])

  function setDefault(id: string) {
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })))
  }

  function updateAddress(id: string, patch: Partial<OutsideDeliveryAddress>) {
    setAddresses((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function addAddress() {
    setAddresses((prev) => [...prev.map((a) => ({ ...a, is_default: false })), { ...newBlankAddress(), is_default: prev.length === 0 }])
  }

  function removeAddress(id: string) {
    setAddresses((prev) => {
      const next = prev.filter((a) => a.id !== id)
      if (next.length === 0) return [newBlankAddress()]
      if (!next.some((a) => a.is_default)) next[0] = { ...next[0], is_default: true }
      return next
    })
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!customerId) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const normalized =
      addresses.some((a) => a.is_default) ? addresses : addresses.map((a, i) => ({ ...a, is_default: i === 0 }))
    const { error: upErr } = await updateCustomerProfile({
      customerId,
      name: name.trim() || null,
      phone_e164: phoneLocal.trim() || null,
      delivery_addresses: normalized,
    })
    if (upErr) {
      setError(upErr.message)
      setSaving(false)
      return
    }
    setCustomerName(name.trim())
    setPhone(phoneLocal.trim())
    const def = normalized.find((a) => a.is_default) ?? normalized[0]
    if (def) setDeliveryAddress(def)
    setNotice(t('Profile saved.', 'تم حفظ الملف الشخصي.'))
    setSaving(false)
  }

  async function onDeleteAccount() {
    if (!deleteConfirm || !customerId) return
    setDeleteBusy(true)
    setDeleteError(null)
    const { error: delErr } = await deleteCustomerAccount()
    if (delErr) {
      setDeleteError(delErr)
      setDeleteBusy(false)
      return
    }
    useCartStore.getState().clearCart()
    await supabase.auth.signOut()
    useSessionStore.getState().clearAuth()
    setDeleteBusy(false)
    navigate('/menu', { replace: true })
  }

  if (!sessionHydrated || !customerId) return null

  const privacyEmail = PRIVACY_DELETION_EMAIL

  return (
    <div className="profile-page">
      <div className="profile-card">
        <h1 className="profile-title">{t('Your profile', 'ملفك الشخصي')}</h1>
        <p className="profile-lead">
          {t('Update your details. Email is managed by your sign-in account and cannot be changed here.', 'حدّث بياناتك. البريد يُدار من حساب تسجيل الدخول ولا يمكن تغييره هنا.')}
        </p>

        {loading ? (
          <p className="profile-muted">{t('Loading…', 'جارٍ التحميل…')}</p>
        ) : (
          <form onSubmit={onSave} className="profile-form">
            <label className="profile-label">{t('Email', 'البريد الإلكتروني')}</label>
            <input className="profile-input" value={customerEmail ?? ''} disabled readOnly dir="ltr" />

            <label className="profile-label" htmlFor="pf-name">
              {t('Full name', 'الاسم الكامل')}
            </label>
            <input id="pf-name" className="profile-input" value={name} onChange={(e) => setName(e.target.value)} />

            <label className="profile-label" htmlFor="pf-phone">
              {t('Mobile', 'الجوال')}
            </label>
            <input id="pf-phone" className="profile-input" type="tel" value={phoneLocal} onChange={(e) => setPhoneLocal(e.target.value)} dir="ltr" />

            <h2 className="profile-section-title">{t('Delivery addresses', 'عناوين التوصيل')}</h2>
            <p className="profile-muted small">
              {t('Add several addresses and mark one as default for checkout.', 'أضف عدة عناوين وحدّد افتراضياً للدفع.')}
            </p>

            {addresses.map((addr, idx) => (
              <fieldset key={addr.id ?? idx} className="profile-address-block">
                <legend className="profile-legend">
                  {t('Address', 'عنوان')} {idx + 1}
                </legend>
                <label className="profile-inline">
                  <input type="radio" name="default-addr" checked={!!addr.is_default} onChange={() => addr.id && setDefault(addr.id)} />
                  {t('Use as default', 'افتراضي للدفع')}
                </label>
                <div className="profile-grid">
                  <div>
                    <label className="profile-label">{t('Street', 'الشارع')}</label>
                    <input
                      className="profile-input"
                      value={addr.street}
                      onChange={(e) => addr.id && updateAddress(addr.id, { street: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="profile-label">{t('Building', 'المبنى')}</label>
                    <input
                      className="profile-input"
                      value={addr.building}
                      onChange={(e) => addr.id && updateAddress(addr.id, { building: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="profile-label">{t('District', 'المنطقة')}</label>
                    <input
                      className="profile-input"
                      value={addr.area}
                      onChange={(e) => addr.id && updateAddress(addr.id, { area: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="profile-label">{t('City', 'المدينة')}</label>
                    <input
                      className="profile-input"
                      value={addr.city}
                      onChange={(e) => addr.id && updateAddress(addr.id, { city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="profile-label">{t('Floor', 'الطابق')}</label>
                    <input
                      className="profile-input"
                      value={addr.floor ?? ''}
                      onChange={(e) => addr.id && updateAddress(addr.id, { floor: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="profile-label">{t('Apartment', 'الشقة')}</label>
                    <input
                      className="profile-input"
                      value={addr.apartment ?? ''}
                      onChange={(e) => addr.id && updateAddress(addr.id, { apartment: e.target.value })}
                    />
                  </div>
                </div>
                <button type="button" className="profile-remove" onClick={() => addr.id && removeAddress(addr.id)}>
                  {t('Remove address', 'حذف العنوان')}
                </button>
              </fieldset>
            ))}

            <button type="button" className="profile-add" onClick={addAddress}>
              {t('Add address', 'إضافة عنوان')}
            </button>

            {notice && <p className="profile-notice">{notice}</p>}
            {error && <p className="profile-error">{error}</p>}

            <button type="submit" className="profile-save" disabled={saving}>
              {saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save changes', 'حفظ التغييرات')}
            </button>
          </form>
        )}

        <section className="profile-danger" aria-labelledby="profile-delete-heading">
          <h2 id="profile-delete-heading" className="profile-section-title">
            {t('Delete account & data', 'حذف الحساب والبيانات')}
          </h2>
          <p className="profile-muted small">
            {t(
              'Permanently removes your profile, sign-in, name, email, mobile number, and saved addresses. Order history may be kept in redacted form where required by law.',
              'يزيل نهائياً ملفك وتسجيل الدخول والاسم والبريد والجوال والعناوين المحفوظة. قد يُحفظ سجل الطلبات بشكل مُخفّى حيث يقتضي القانون ذلك.',
            )}
          </p>
          <label className="profile-inline profile-delete-confirm">
            <input
              type="checkbox"
              checked={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.checked)}
            />
            {t('I understand this cannot be undone', 'أفهم أن هذا الإجراء لا يمكن التراجع عنه')}
          </label>
          {deleteError ? <p className="profile-error">{deleteError}</p> : null}
          <button
            type="button"
            className="profile-delete-btn"
            disabled={!deleteConfirm || deleteBusy}
            onClick={() => void onDeleteAccount()}
          >
            {deleteBusy ? t('Deleting…', 'جارٍ الحذف…') : t('Delete my account', 'حذف حسابي')}
          </button>
          <p className="profile-muted small">
            {t('Prefer email?', 'تفضّل البريد؟')}{' '}
            <a
              href={`mailto:${encodeURIComponent(privacyEmail)}?subject=${encodeURIComponent(t('Request deletion of my personal data', 'طلب حذف بياناتي الشخصية'))}`}
              className="profile-inline-link"
            >
              {privacyEmail}
            </a>
          </p>
        </section>

        <nav className="profile-links" aria-label={t('Profile links', 'روابط الملف')}>
          <Link to="/privacy">{t('Privacy Policy', 'سياسة الخصوصية')}</Link>
          <Link to="/data-protection">{t('Data Protection', 'حماية البيانات')}</Link>
          <Link to="/menu">{t('Back to menu', 'العودة إلى القائمة')}</Link>
          <Link to="/referral">{t('Referral program', 'برنامج الإحالة')}</Link>
        </nav>
      </div>

      <style>{`
        .profile-page { min-height: 50vh; padding: 1.5rem 1rem 3rem; }
        .profile-card { max-width: 560px; margin: 0 auto; background: var(--surface-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); padding: 1.5rem; }
        .profile-title { font-family: var(--font-display); font-weight: 400; margin: 0 0 0.5rem; color: var(--ink); }
        .profile-lead { color: var(--ink-muted); font-size: 0.9rem; line-height: 1.5; margin: 0 0 1.25rem; }
        .profile-muted { color: var(--ink-muted); }
        .profile-muted.small { font-size: 0.82rem; margin-top: -0.25rem; }
        .profile-form { display: flex; flex-direction: column; gap: 0.75rem; }
        .profile-label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); }
        .profile-input { width: 100%; padding: 0.55rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--cream); font-size: 0.95rem; }
        .profile-input:disabled { opacity: 0.75; }
        .profile-section-title { font-size: 1.05rem; margin: 1rem 0 0; color: var(--ink); }
        .profile-address-block { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem 1rem 1rem; margin: 0.5rem 0; }
        .profile-legend { font-weight: 600; padding: 0 0.35rem; color: var(--ink); }
        .profile-inline { display: flex; align-items: center; gap: 0.4rem; font-size: 0.88rem; margin-bottom: 0.5rem; cursor: pointer; }
        .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
        @media (max-width: 520px) { .profile-grid { grid-template-columns: 1fr; } }
        .profile-remove { align-self: flex-start; margin-top: 0.35rem; background: none; border: none; color: var(--danger, #b91c1c); text-decoration: underline; cursor: pointer; font-size: 0.85rem; }
        .profile-add { align-self: flex-start; background: none; border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); padding: 0.45rem 0.75rem; cursor: pointer; color: var(--ink); font-size: 0.88rem; }
        .profile-notice { color: var(--success, #166534); font-size: 0.88rem; margin: 0; }
        .profile-error { color: var(--danger); font-size: 0.88rem; margin: 0; }
        .profile-save { margin-top: 0.5rem; padding: 0.75rem; border: none; border-radius: var(--radius-md); background: var(--ink); color: var(--cream); font-weight: 600; cursor: pointer; }
        .profile-save:disabled { opacity: 0.55; cursor: not-allowed; }
        .profile-danger { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(185, 28, 28, 0.25); }
        .profile-delete-confirm { margin: 0.75rem 0; }
        .profile-delete-btn { width: 100%; padding: 0.75rem; border: 1px solid rgba(185, 28, 28, 0.55); border-radius: var(--radius-md); background: rgba(185, 28, 28, 0.08); color: #b91c1c; font-weight: 700; cursor: pointer; }
        .profile-delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .profile-inline-link { color: var(--gold-dark, #8a6d3b); font-weight: 600; }
        .profile-links { display: flex; flex-direction: column; gap: 0.45rem; margin-top: 1.25rem; font-size: 0.88rem; }
        .profile-links a { color: var(--ink-muted); text-decoration: underline; }
      `}</style>
    </div>
  )
}
