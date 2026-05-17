export function requireServiceRoleRequest(req: Request): void {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    throw new Error('Service role key is not configured')
  }

  const authorization = req.headers.get('Authorization')
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : null
  const apiKey = req.headers.get('apikey')?.trim() ?? null

  if (bearerToken !== serviceRoleKey && apiKey !== serviceRoleKey) {
    throw new Error('Unauthorized')
  }
}
