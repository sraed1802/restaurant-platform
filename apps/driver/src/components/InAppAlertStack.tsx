import type { DriverAlert } from '../hooks/useDriverRealtimeAlerts'

export default function InAppAlertStack({
  alerts,
  onDismiss,
}: {
  alerts: DriverAlert[]
  onDismiss: (id: string) => void
}) {
  if (alerts.length === 0) return null

  return (
    <>
      {alerts.map((alert, index) => (
        <div
          key={alert.id}
          className="driver-in-app-alert"
          style={{ bottom: `${1 + index * 5.75}rem` }}
          role="alert"
        >
          <strong>{alert.title}</strong>
          <p>{alert.message}</p>
          <button type="button" onClick={() => onDismiss(alert.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
      <style>{`
        .driver-in-app-alert {
          position: fixed;
          left: 1rem;
          right: 1rem;
          z-index: 9999;
          padding: 0.85rem 2.5rem 0.85rem 1rem;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.96), rgba(29, 78, 216, 0.92));
          color: #fff;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
          animation: driverAlertIn 0.28s ease-out;
        }
        .driver-in-app-alert strong {
          display: block;
          font-size: 0.82rem;
          margin-bottom: 0.25rem;
        }
        .driver-in-app-alert p {
          margin: 0;
          font-size: 0.78rem;
          line-height: 1.4;
          opacity: 0.95;
        }
        .driver-in-app-alert button {
          position: absolute;
          top: 0.55rem;
          right: 0.55rem;
          border: none;
          background: rgba(255, 255, 255, 0.18);
          color: #fff;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          cursor: pointer;
        }
        @keyframes driverAlertIn {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
