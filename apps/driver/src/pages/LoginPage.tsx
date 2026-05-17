import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">🛵</span>
          <h1>DRIVER CONSOLE</h1>
          <p>Assigned deliveries, cash collection, and status updates</p>
        </div>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault()
            void signIn()
          }}
        >
          {error && <div className="login-error">{error}</div>}
          <div className="field-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver@restaurant.qa"
              onKeyDown={(e) => e.key === 'Enter' && signIn()}
              autoFocus
            />
          </div>
          <div className="field-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && signIn()}
            />
          </div>
          <button className="login-btn" type="submit" disabled={loading || !email || !password}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">Access is limited to linked, active driver accounts.</p>
      </div>
    </div>
  )
}
