// apps/admin/src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react'
import { captureException } from '../lib/sentry'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    captureException(error, { errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--bg)'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ 
            fontFamily: 'var(--font-ui)', 
            fontSize: '2rem', 
            fontWeight: 600, 
            marginBottom: '1rem',
            color: 'var(--text)'
          }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--text-soft)', marginBottom: '2rem', maxWidth: '400px' }}>
            We apologize for the inconvenience. Please refresh the page or try again later.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '0.85rem 2rem',
              background: 'var(--blue)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
