/** Site origin for auth redirects (LAN / tunnel — see `VITE_SITE_URL` in `.env.example`). */
export function getEmailRedirectOrigin(): string {
  const configured = import.meta.env.VITE_SITE_URL as string | undefined
  if (configured?.trim()) {
    return configured.trim().replace(/\/$/, '')
  }
  return window.location.origin
}
