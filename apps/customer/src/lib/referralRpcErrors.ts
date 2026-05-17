/** PostgREST: function not in schema cache (migration not applied or wrong overload). */
export function isReferralRpcUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const o = error as { code?: string; message?: string }
  if (o.code === 'PGRST202') return true
  const msg = o.message
  return typeof msg === 'string' && msg.includes('schema cache')
}
