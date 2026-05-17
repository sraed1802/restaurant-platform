// apps/admin/src/pages/LoginPage.tsx
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchPublicRestaurantBranding } from '../lib/publicRestaurantBranding'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const brandingQuery = useQuery({
    queryKey: ['public_restaurant_branding'],
    queryFn: fetchPublicRestaurantBranding,
    staleTime: 5 * 60_000,
  })
  const b = brandingQuery.data
  const shellLogo = b?.admin_shell_logo_url || b?.loading_logo_url || b?.logo_url
  const title = b?.restaurant_name_en || 'Ops Center'
  const subtitle = b?.restaurant_tagline_en || 'Restaurant Intelligence Platform'
  const accent = b?.primary_color || undefined

  async function signIn(event?: FormEvent) {
    event?.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          {shellLogo ? (
            <img src={shellLogo} alt="" className="login-logo-img" width={72} height={72} decoding="async" />
          ) : (
            <span className="login-logo">▣</span>
          )}
          <h1>{title.toUpperCase()}</h1>
          <p>{subtitle}</p>
        </div>

        <form className="login-form" onSubmit={(e) => void signIn(e)} noValidate>
          {error && <div className="login-error">{error}</div>}
          <div className="field-group">
            <label htmlFor="admin-login-email">Email</label>
            <input
              id="admin-login-email"
              name="username"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@restaurant.qa"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="field-group">
            <label htmlFor="admin-login-password">Password</label>
            <input
              id="admin-login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="login-btn"
            disabled={loading || !email || !password}
            style={accent ? { background: accent } : undefined}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">Access restricted to authorized staff only</p>
      </div>

      <style>{`
        .login-page {
          min-height: 100dvh; display: flex;
          align-items: center; justify-content: center;
          background: var(--bg);
          padding: 1rem;
        }
        .login-card {
          width: 380px; max-width: 100%;
          background: var(--bg-2); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 2.5rem;
        }
        .login-brand { text-align: center; margin-bottom: 2.5rem; }
        .login-logo { font-size: 2.5rem; color: var(--gold); display: block; margin-bottom: 0.75rem; }
        .login-logo-img {
          display: block;
          margin: 0 auto 0.75rem;
          max-width: 72px;
          max-height: 72px;
          object-fit: contain;
        }
        .login-brand h1 { font-size: 1rem; font-weight: 800; letter-spacing: 0.2em; color: var(--text); }
        .login-brand p { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem; letter-spacing: 0.04em; }
        .login-form { display: flex; flex-direction: column; gap: 0.75rem; }
        .login-error {
          background: var(--red-dim); border: 1px solid rgba(239,68,68,0.25);
          border-radius: var(--radius); padding: 0.65rem 0.85rem;
          font-size: 0.78rem; color: var(--red);
        }
        .field-group label { display: block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; }
        .login-btn {
          width: 100%; padding: 0.85rem;
          background: var(--gold); color: #1a0f00;
          border-radius: var(--radius); font-size: 0.875rem; font-weight: 700;
          margin-top: 0.5rem; transition: all 150ms ease;
        }
        .login-btn:hover:not(:disabled) { filter: brightness(1.06); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-footer { text-align: center; font-size: 0.65rem; color: var(--text-muted); margin-top: 2rem; }
      `}</style>
    </div>
  )
}
