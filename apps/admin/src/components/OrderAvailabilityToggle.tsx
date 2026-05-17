import { useCallback, useEffect, useState } from 'react'
import { useTenantScope } from '@rms/platform'
import {
  getOrderAvailabilitySettings,
  setOrderAvailabilityManualMode,
  type OrderAvailabilitySettings,
  type OrderAvailabilityStatus,
} from '../services/orderAvailability'

type StaffRole = 'admin' | 'manager' | 'supervisor' | null

type Props = {
  staffRole?: StaffRole
  /** Compact pill for dashboard header */
  variant?: 'default' | 'compact'
}

export default function OrderAvailabilityToggle({ staffRole, variant = 'default' }: Props) {
  const tenantScope = useTenantScope()
  const [settings, setSettings] = useState<OrderAvailabilitySettings | null>(null)
  const [status, setStatus] = useState<OrderAvailabilityStatus | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getOrderAvailabilitySettings(tenantScope)
      setSettings(response.settings)
      setStatus(response.status)
      setCanEdit(response.can_edit && staffRole === 'admin')
    } catch (err) {
      console.error('Order availability load failed:', err)
      setError('Availability unavailable')
      setSettings(null)
      setStatus(null)
      setCanEdit(false)
    } finally {
      setLoading(false)
    }
  }, [staffRole, tenantScope])

  useEffect(() => {
    void load()
  }, [load])

  async function handleToggle(nextOpen: boolean) {
    if (!canEdit || !settings || saving) return

    setSaving(true)
    setError(null)
    try {
      const response = await setOrderAvailabilityManualMode(
        tenantScope,
        nextOpen ? 'force_open' : 'force_closed',
        settings,
      )
      setSettings(response.settings)
      setStatus(response.status)
      setCanEdit(response.can_edit && staffRole === 'admin')
    } catch (err) {
      console.error('Order availability toggle failed:', err)
      setError(err instanceof Error ? err.message : 'Could not update availability')
    } finally {
      setSaving(false)
    }
  }

  const accepting = status?.is_open_now === true
  const scheduledMode = settings?.manual_mode === 'scheduled'
  const compact = variant === 'compact'

  return (
    <div
      className={`order-avail-toggle ${compact ? 'order-avail-toggle--compact' : ''} ${accepting ? 'is-open' : 'is-closed'}`}
      title={
        canEdit
          ? accepting
            ? 'Guests can place orders — click to close'
            : 'Orders closed for guests — click to open'
          : 'Only admins can change order availability'
      }
    >
      <div className="order-avail-copy">
        <span className="order-avail-label">{compact ? 'Menu orders' : 'Guest ordering'}</span>
        <span className="order-avail-status">
          {loading ? '…' : accepting ? 'Open' : 'Closed'}
          {!loading && scheduledMode ? ' · scheduled' : ''}
        </span>
      </div>
      <label className="order-avail-switch">
        <input
          type="checkbox"
          checked={accepting}
          disabled={!canEdit || loading || saving}
          onChange={(e) => void handleToggle(e.target.checked)}
          aria-label={accepting ? 'Close guest ordering' : 'Open guest ordering'}
        />
        <span className="order-avail-slider" />
      </label>
      {error ? <span className="order-avail-error">{error}</span> : null}

      <style>{`
        .order-avail-toggle {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
          padding: 0.4rem 0.75rem 0.4rem 0.85rem;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--bg-2);
        }
        .order-avail-toggle.is-open {
          border-color: rgba(34, 197, 94, 0.35);
          background: var(--green-dim);
        }
        .order-avail-toggle.is-closed {
          border-color: rgba(239, 68, 68, 0.25);
          background: var(--red-dim);
        }
        .order-avail-toggle--compact {
          padding: 0.35rem 0.65rem 0.35rem 0.75rem;
        }
        .order-avail-copy {
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
          min-width: 0;
        }
        .order-avail-label {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .order-avail-status {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
        }
        .order-avail-toggle.is-open .order-avail-status {
          color: var(--green);
        }
        .order-avail-toggle.is-closed .order-avail-status {
          color: var(--red);
        }
        .order-avail-switch {
          position: relative;
          width: 44px;
          height: 24px;
          flex-shrink: 0;
        }
        .order-avail-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .order-avail-slider {
          position: absolute;
          inset: 0;
          cursor: pointer;
          background: var(--bg-3);
          border: 1px solid var(--border-2);
          border-radius: 24px;
          transition: background 0.2s, border-color 0.2s;
        }
        .order-avail-slider::before {
          content: '';
          position: absolute;
          height: 18px;
          width: 18px;
          left: 2px;
          bottom: 2px;
          background: var(--text);
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .order-avail-switch input:checked + .order-avail-slider {
          background: var(--green);
          border-color: rgba(34, 197, 94, 0.5);
        }
        .order-avail-switch input:checked + .order-avail-slider::before {
          transform: translateX(20px);
          background: #fff;
        }
        .order-avail-switch input:disabled + .order-avail-slider {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .order-avail-error {
          width: 100%;
          font-size: 0.65rem;
          color: var(--red);
        }
      `}</style>
    </div>
  )
}
