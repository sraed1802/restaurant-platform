// packages/ui/src/Input.tsx
import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  fullWidth?: boolean
}

export default function Input({ 
  label, 
  error, 
  fullWidth = false,
  id,
  ...props 
}: InputProps) {
  const baseStyles = {
    width: fullWidth ? '100%' : 'auto',
    padding: '0.75rem 1rem',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 'var(--radius-sm, 6px)',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    background: 'var(--surface, #ffffff)',
    color: 'var(--text, #1a1a1a)',
    transition: 'border-color 0.2s ease',
  }

  const errorStyles = error ? {
    borderColor: 'var(--red, #c0392b)',
  } : {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <label 
          htmlFor={id}
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--text, #1a1a1a)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        style={{
          ...baseStyles,
          ...errorStyles,
        }}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <span 
          id={`${id}-error`}
          style={{
            fontSize: '0.75rem',
            color: 'var(--red, #c0392b)',
          }}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
}
