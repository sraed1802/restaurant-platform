// apps/admin/src/components/Toast.tsx
import { useEffect, useState, type CSSProperties } from 'react'

interface ToastProps {
  title?: string
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose?: () => void
  style?: CSSProperties
}

export default function Toast({
  title,
  message,
  type = 'success',
  duration = 3000,
  onClose,
  style,
}: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  if (!visible) return null

  const bgColor = {
    success: 'rgba(34, 197, 94, 0.95)',
    error: 'rgba(239, 68, 68, 0.95)',
    info: 'rgba(59, 130, 246, 0.95)',
  }[type]

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        background: bgColor,
        color: 'white',
        padding: '1rem 1.5rem',
        borderRadius: 'var(--radius, 8px)',
        fontSize: '0.875rem',
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 9999,
        animation: 'slideIn 0.3s ease-out',
        maxWidth: 'min(360px, calc(100vw - 2rem))',
        ...style,
      }}
      role="alert"
      aria-live="polite"
    >
      {title && (
        <div style={{ fontSize: '0.76rem', opacity: 0.92, marginBottom: '0.35rem', letterSpacing: '0.02em' }}>
          {title}
        </div>
      )}
      {message}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
  }

  const hideToast = () => {
    setToast(null)
  }

  const ToastComponent = toast ? (
    <Toast message={toast.message} type={toast.type} onClose={hideToast} />
  ) : null

  return { showToast, ToastComponent }
}
