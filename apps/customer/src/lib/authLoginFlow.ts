import { getEmailRedirectOrigin } from './siteUrl'

export type AuthCallbackFlow = 'signup_confirm' | 'magic'

/** Supabase appends `code` to this URL; keep `flow` + `next` so the callback can branch. */
export function buildAuthCallbackRedirectUrl(nextPath: string, flow: AuthCallbackFlow): string {
  const safeNext = nextPath.startsWith('/') ? nextPath : '/menu'
  const u = new URL('/auth/callback', getEmailRedirectOrigin())
  u.searchParams.set('next', safeNext)
  u.searchParams.set('flow', flow)
  return u.toString()
}

/** One-time password for email-only signup (user never sees it; enables “confirm email” mail). */
export function makeSignupOnlyPassword(): string {
  const part =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`
  return `Rms_${part}_9!z`
}

export function isAuthUserAlreadyExistsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already') ||
    msg.includes('email address is already registered') ||
    msg.includes('database error saving new user')
  )
}

export function isAuthConfirmationEmailError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('error sending confirmation email') ||
    msg.includes('error sending magic link email') ||
    msg.includes('error sending email') ||
    msg.includes('email rate limit exceeded')
  )
}
