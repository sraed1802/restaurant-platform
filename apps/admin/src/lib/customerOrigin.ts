/** Public customer ordering site origin (menu iframe, links). */
export function resolveCustomerOrigin(): string {
  const configured =
    (import.meta.env.VITE_CUSTOMER_ORIGIN as string | undefined)?.trim() ||
    (import.meta.env.VITE_SITE_URL as string | undefined)?.trim()
  return (configured || 'http://localhost:5173').replace(/\/$/, '')
}

export function guestAppPreviewSrc(): string {
  return `${resolveCustomerOrigin()}/menu?embed=1`
}
