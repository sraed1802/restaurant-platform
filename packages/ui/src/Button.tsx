// packages/ui/src/Button.tsx
import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export default function Button({ 
  variant = 'primary', 
  size = 'md', 
  loading = false,
  disabled,
  children,
  ...props 
}: ButtonProps) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-sm, 6px)',
    fontWeight: 500,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    border: 'none',
    fontFamily: 'inherit',
  }

  const variantStyles = {
    primary: {
      background: 'var(--ink, #1a1a1a)',
      color: 'var(--cream, #f5f0e8)',
    },
    secondary: {
      background: 'var(--bg-3, #f0f0f0)',
      color: 'var(--text, #1a1a1a)',
    },
    danger: {
      background: 'var(--red, #c0392b)',
      color: 'white',
    },
  }

  const sizeStyles = {
    sm: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
    md: { padding: '0.75rem 1.5rem', fontSize: '0.9rem' },
    lg: { padding: '1rem 2rem', fontSize: '1rem' },
  }

  return (
    <button
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
        opacity: disabled || loading ? 0.6 : 1,
      }}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className="spinner">⟳</span>}
      {children}
    </button>
  )
}
