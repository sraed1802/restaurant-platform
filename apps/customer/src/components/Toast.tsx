// apps/customer/src/components/Toast.tsx
import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose?: () => void
}

export default function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
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
    success: 'rgba(39, 174, 96, 0.95)',
    error: 'rgba(192, 57, 43, 0.95)',
    info: 'rgba(52, 152, 219, 0.95)',
  }[type]

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: bgColor,
        color: 'white',
        padding: '1rem 1.5rem',
        borderRadius: 'var(--radius-md, 8px)',
        fontSize: '0.9rem',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 9999,
        animation: 'slideUp 0.3s ease-out',
      }}
      role="alert"
      aria-live="polite"
    >
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
