// apps/admin/src/pages/DriversPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getSupabaseFunctionErrorMessage } from '../lib/supabaseFunctionErrors'
import {
  createDriver,
  deleteDriver as deleteDriverRecord,
  listDrivers,
  setDriverStatus,
  toggleDriverActive,
  updateDriver,
  type DriverAdminRecord,
  type DriverStatus,
} from '../services/drivers'

type Driver = DriverAdminRecord

interface DriverFormState {
  name: string
  phone_e164: string
  vehicle_type: string
  notes: string
  login_email: string
  password: string
}

const STATUS_COLORS: Record<DriverStatus, string> = {
  offline: 'var(--text-muted)',
  available: 'var(--green)',
  busy: 'var(--amber)',
  break: 'var(--blue)',
}

const STATUS_LABELS: Record<DriverStatus, string> = {
  offline: 'Offline', available: 'Available', busy: 'On Delivery', break: 'On Break',
}

const EMPTY_DRIVER: DriverFormState = {
  name: '',
  phone_e164: '+974',
  vehicle_type: 'motorcycle',
  notes: '',
  login_email: '',
  password: '',
}

function resolveDriverPortalUrl() {
  const configuredUrl =
    typeof import.meta.env.VITE_DRIVER_PORTAL_URL === 'string'
      ? import.meta.env.VITE_DRIVER_PORTAL_URL.trim()
      : ''

  if (configuredUrl) {
    return new URL('/login', configuredUrl).toString()
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5175/login'
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5175/login'
  }

  if (window.location.hostname.startsWith('ops.')) {
    return `${window.location.protocol}//${window.location.hostname.replace(/^ops\./, 'driver.')}/login`
  }

  return `${window.location.origin}/login`
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [form, setForm] = useState<DriverFormState>(EMPTY_DRIVER)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [portalCopyMessage, setPortalCopyMessage] = useState<string | null>(null)

  const driverPortalUrl = resolveDriverPortalUrl()
  const driverNeedsLoginSetup = Boolean(editingDriver && !editingDriver.auth_user_id)

  useEffect(() => {
    void loadDrivers()
    const channel = supabase
      .channel('admin:drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        void loadDrivers()
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  async function loadDrivers() {
    try {
      const data = await listDrivers()
      setDrivers(data)
      setActionError(null)
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to load drivers')
      setActionError(message)
    } finally {
      setLoading(false)
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditingDriver(null)
    setForm(EMPTY_DRIVER)
  }

  function openEdit(driver: Driver) {
    setEditingDriver(driver)
    setForm({
      name: driver.name,
      phone_e164: driver.phone_e164,
      vehicle_type: driver.vehicle_type,
      notes: driver.notes ?? '',
      login_email: driver.login_email ?? '',
      password: '',
    })
    setShowForm(true)
  }

  async function saveDriver() {
    const requiresPassword = !editingDriver || driverNeedsLoginSetup
    if (!form.name.trim() || !form.phone_e164.trim() || !form.login_email.trim() || (requiresPassword && !form.password.trim())) {
      return
    }

    setSaving(true)
    try {
      if (editingDriver) {
        await updateDriver(editingDriver.id, {
          name: form.name.trim(),
          phone_e164: form.phone_e164.trim(),
          vehicle_type: form.vehicle_type,
          notes: form.notes.trim() || null,
          login_email: form.login_email.trim().toLowerCase(),
          password: form.password.trim() || null,
        })
      } else {
        await createDriver({
          name: form.name.trim(),
          phone_e164: form.phone_e164.trim(),
          vehicle_type: form.vehicle_type,
          notes: form.notes.trim() || null,
          login_email: form.login_email.trim().toLowerCase(),
          password: form.password.trim(),
        })
      }

      setActionError(null)
      closeForm()
      await loadDrivers()
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to save driver')
      setActionError(message)
    } finally {
      setSaving(false)
    }
  }

  async function copyDriverPortalLink() {
    try {
      await navigator.clipboard.writeText(driverPortalUrl)
      setPortalCopyMessage('Driver portal link copied.')
      window.setTimeout(() => setPortalCopyMessage(null), 2500)
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to copy driver portal link')
      setActionError(message)
    }
  }

  async function copyDriverLoginEmail(driver: Driver) {
    if (!driver.login_email) {
      return
    }

    try {
      await navigator.clipboard.writeText(driver.login_email)
      setPortalCopyMessage(`Copied login email for ${driver.name}.`)
      window.setTimeout(() => setPortalCopyMessage(null), 2500)
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to copy driver login email')
      setActionError(message)
    }
  }

  async function updateStatus(driverId: string, status: DriverStatus) {
    try {
      await setDriverStatus(driverId, status)
      setActionError(null)
      await loadDrivers()
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to update driver status')
      setActionError(message)
    }
  }

  async function toggleActive(driver: Driver) {
    try {
      await toggleDriverActive(driver.id, !driver.is_active)
      setActionError(null)
      await loadDrivers()
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to update driver availability')
      setActionError(message)
    }
  }

  async function deleteDriver(driver: Driver) {
    if (!confirm(`Are you sure you want to delete driver "${driver.name}"? This action cannot be undone.`)) return
    if (driver.active_order_id) {
      alert('Cannot delete driver with an active order. Please complete or reassign the order first.')
      return
    }

    try {
      await deleteDriverRecord(driver.id)
      setActionError(null)
      await loadDrivers()
    } catch (error) {
      const message = await getSupabaseFunctionErrorMessage(error, 'Failed to delete driver')
      setActionError(message)
    }
  }

  const available = drivers.filter((d) => d.status === 'available' && d.is_active).length
  const busy = drivers.filter((d) => d.status === 'busy').length
  const total = drivers.filter((d) => d.is_active).length

  return (
    <div className="drivers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Drivers</h1>
          <p className="page-sub">{available} available · {busy} on delivery · {total} total active</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingDriver(null); setForm(EMPTY_DRIVER); setShowForm(true) }}>
          + Add Driver
        </button>
      </div>

      {actionError && <div className="action-error">{actionError}</div>}
      {portalCopyMessage && <div className="message-banner success">{portalCopyMessage}</div>}

      <div className="portal-share-card">
        <div>
          <p className="portal-share-label">Driver portal access</p>
          <p className="portal-share-link mono">{driverPortalUrl}</p>
          <p className="portal-share-note">
            Share this login link with drivers. They sign in using the login email configured on their driver record.
          </p>
        </div>
        <div className="portal-share-actions">
          <a className="btn btn-ghost" href={driverPortalUrl} target="_blank" rel="noreferrer">
            Open Portal
          </a>
          <button className="btn btn-ghost" onClick={() => void copyDriverPortalLink()}>
            Copy Link
          </button>
        </div>
      </div>

      <div className="driver-stats">
        {(['available', 'busy', 'break', 'offline'] as DriverStatus[]).map((status) => {
          const count = drivers.filter((d) => d.status === status).length
          return (
            <div key={status} className="driver-stat-card">
              <div className="dsc-dot" style={{ background: STATUS_COLORS[status] }} />
              <div>
                <div className="dsc-count">{count}</div>
                <div className="dsc-label">{STATUS_LABELS[status]}</div>
              </div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div className="driver-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="driver-card-skeleton" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="empty-state">
          <span>◬</span><p>No drivers added yet</p>
        </div>
      ) : (
        <div className="driver-grid">
          {drivers.map((driver) => (
            <div key={driver.id} className={`driver-card ${!driver.is_active ? 'inactive' : ''}`}>
              {(() => {
                const driverLockedByOrder = Boolean(driver.active_order_id)

                return (
                  <>
              <div className="dc-header">
                <div className="dc-avatar" style={{ borderColor: STATUS_COLORS[driver.status] }}>
                  {driver.name[0]?.toUpperCase()}
                </div>
                <div className="dc-info">
                  <p className="dc-name">{driver.name}</p>
                  <p className="dc-phone mono">{driver.phone_e164}</p>
                </div>
                <div className="dc-status-dot" style={{ background: STATUS_COLORS[driver.status] }} />
              </div>

              <div className="dc-meta">
                <span className="dc-meta-item">🏍 {driver.vehicle_type}</span>
                <span className="dc-status-badge" style={{ color: STATUS_COLORS[driver.status] }}>
                  {STATUS_LABELS[driver.status]}
                </span>
              </div>

              <div className="dc-auth-row">
                <span className={`dc-auth-badge ${driver.auth_user_id ? 'connected' : 'missing'}`}>
                  {driver.auth_user_id ? 'Login active' : 'Login missing'}
                </span>
                <span className="dc-auth-email mono">{driver.login_email ?? 'No login email'}</span>
              </div>

              {driver.active_order_id && (
                <div className="dc-active-order">
                  <span>Order: </span>
                  <span className="mono">#{driver.active_order_id.slice(0, 8).toUpperCase()}</span>
                </div>
              )}

              {driver.notes && (
                <p className="dc-notes">{driver.notes}</p>
              )}

              {driver.last_active_at && (
                <p className="dc-last-active">
                  Last active: {new Date(driver.last_active_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <div className="dc-actions">
                {driver.is_active && (
                  driverLockedByOrder ? (
                    <div className="dc-status-lock" title="Status stays busy until the assigned order is completed or reassigned.">
                      Busy while assigned
                    </div>
                  ) : (
                    <select
                      value={driver.status}
                      onChange={(e) => updateStatus(driver.id, e.target.value as DriverStatus)}
                      className="dc-status-select"
                    >
                      <option value="offline">Set Offline</option>
                      <option value="available">Set Available</option>
                      <option value="break">Set Break</option>
                    </select>
                  )
                )}
                <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }} onClick={() => openEdit(driver)}>
                  Edit
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => void copyDriverPortalLink()}
                >
                  Copy Link
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                  disabled={!driver.login_email}
                  onClick={() => void copyDriverLoginEmail(driver)}
                  title={driver.login_email ? 'Copy login email' : 'Create driver login credentials first'}
                >
                  Copy Login
                </button>
                <button
                  className={`btn ${driver.is_active ? 'btn-danger' : 'btn-ghost'}`}
                  style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                  disabled={driverLockedByOrder}
                  onClick={() => toggleActive(driver)}
                  title={driverLockedByOrder ? 'Cannot deactivate a driver with an active order.' : undefined}
                >
                  {driver.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => deleteDriver(driver)}
                >
                  Delete
                </button>
              </div>
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingDriver ? 'Edit Driver' : 'Add Driver'}</h2>
              <button onClick={closeForm} className="sl-close">✕</button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void saveDriver()
              }}
            >
              <div className="modal-body">
                <input type="text" name="username" autoComplete="username" value={form.login_email} readOnly hidden />
                <div className="field-group">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Driver name" />
                </div>
                <div className="field-group">
                  <label>Phone (E.164) *</label>
                  <input value={form.phone_e164} onChange={(e) => setForm((f) => ({ ...f, phone_e164: e.target.value }))} placeholder="+97412345678" dir="ltr" />
                </div>
                <div className="field-group">
                  <label>Vehicle Type</label>
                  <select value={form.vehicle_type} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="car">Car</option>
                    <option value="bicycle">Bicycle</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any notes about this driver…" />
                </div>
                <div className="field-group">
                  <label>Login Email *</label>
                  <input
                    type="email"
                    name="driver_login_email"
                    autoComplete="username"
                    value={form.login_email}
                    onChange={(e) => setForm((f) => ({ ...f, login_email: e.target.value }))}
                    placeholder="driver@restaurant.qa"
                    autoCapitalize="off"
                  />
                </div>
                <div className="field-group">
                  <label>
                    {editingDriver
                      ? driverNeedsLoginSetup
                        ? 'Temporary Password *'
                        : 'Reset Password'
                      : 'Temporary Password *'}
                  </label>
                  <input
                    type="password"
                    name="driver_password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={
                      editingDriver
                        ? driverNeedsLoginSetup
                          ? 'Required to enable portal access'
                          : 'Leave blank to keep current password'
                        : 'At least 8 characters'
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" type="button" onClick={closeForm}>Cancel</button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={
                    saving ||
                    !form.name.trim() ||
                    !form.phone_e164.trim() ||
                    !form.login_email.trim() ||
                    ((!editingDriver || driverNeedsLoginSetup) && !form.password.trim())
                  }
                >
                  {saving ? 'Saving…' : editingDriver ? 'Save Changes' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .drivers-page { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; gap: 0.75rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; }
        .page-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
        .action-error { margin-bottom: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius); background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: var(--red); font-size: 0.8rem; }
        .message-banner.success { margin-bottom: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius); background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); color: var(--green); font-size: 0.8rem; }
        .portal-share-card { margin-bottom: 1rem; padding: 1rem; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg-card); display: flex; gap: 1rem; align-items: center; justify-content: space-between; }
        .portal-share-actions { display: flex; gap: 0.5rem; align-items: center; }
        .portal-share-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; }
        .portal-share-link { font-size: 0.84rem; color: var(--text); word-break: break-all; }
        .portal-share-note { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.35rem; }

        .driver-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
        @media (max-width: 640px) { .driver-stats { grid-template-columns: repeat(2, 1fr); } }
        .driver-stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem; display: flex; align-items: center; gap: 0.75rem; }
        .dsc-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .dsc-count { font-size: 1.4rem; font-weight: 700; font-family: var(--font-mono); }
        .dsc-label { font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }

        .driver-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }
        .driver-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .driver-card.inactive { opacity: 0.45; }
        .driver-card-skeleton { height: 180px; background: var(--bg-3); border-radius: var(--radius-lg); animation: pulse 1.5s infinite; }

        .dc-header { display: flex; align-items: center; gap: 0.75rem; }
        .dc-avatar { width: 38px; height: 38px; border-radius: 50%; border: 2px solid; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 700; background: var(--bg-3); color: var(--text); flex-shrink: 0; }
        .dc-info { flex: 1; min-width: 0; }
        .dc-name { font-size: 0.9rem; font-weight: 700; color: var(--text); }
        .dc-phone { font-size: 0.68rem; color: var(--text-muted); }
        .dc-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .dc-meta { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
        .dc-meta-item { font-size: 0.72rem; color: var(--text-muted); }
        .dc-status-badge { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .dc-auth-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .dc-auth-badge { border-radius: 999px; padding: 0.18rem 0.55rem; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
        .dc-auth-badge.connected { background: var(--green-dim); color: var(--green); }
        .dc-auth-badge.missing { background: var(--red-dim); color: var(--red); }
        .dc-auth-email { font-size: 0.68rem; color: var(--text-muted); }

        .dc-active-order { background: var(--amber-dim); border: 1px solid rgba(245,158,11,0.2); border-radius: 6px; padding: 0.3rem 0.6rem; font-size: 0.72rem; color: var(--amber); }
        .dc-notes { font-size: 0.72rem; color: var(--text-muted); font-style: italic; }
        .dc-last-active { font-size: 0.65rem; color: var(--text-muted); }

        .dc-actions { display: flex; gap: 0.35rem; align-items: center; margin-top: 0.25rem; flex-wrap: wrap; }
        .dc-status-select { flex: 1; min-width: 100px; font-size: 0.72rem; padding: 0.35rem 0.5rem; }
        .dc-status-lock { flex: 1; min-width: 120px; padding: 0.42rem 0.6rem; border-radius: 8px; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.2); color: var(--amber); font-size: 0.72rem; font-weight: 700; text-align: center; }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 4rem; color: var(--text-muted); }
        .empty-state span { font-size: 2rem; }
        .empty-state p { font-size: 0.875rem; }

        .modal-backdrop { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; }
        .modal-box { width: 440px; max-width: 95vw; background: var(--bg-2); border: 1px solid var(--border-2); border-radius: var(--radius-lg); animation: slideIn 0.25s ease; overflow: hidden; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 1rem; font-weight: 700; }
        .modal-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .field-group label { display: block; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; }
        .modal-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.5rem; }
        .sl-close { width: 28px; height: 28px; border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
        .sl-close:hover { background: var(--bg-3); }
        @media (max-width: 640px) {
          .portal-share-card { flex-direction: column; align-items: stretch; }
          .portal-share-actions { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  )
}
