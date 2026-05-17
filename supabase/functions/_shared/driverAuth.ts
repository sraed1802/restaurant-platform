import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2'

export type DriverStatus = 'offline' | 'available' | 'busy' | 'break'

export interface DriverRecord {
  id: string
  auth_user_id: string | null
  name: string
  phone_e164: string
  status: DriverStatus
  active_order_id: string | null
  is_active: boolean
  login_email: string | null
}

export interface AuthenticatedDriver {
  user: User
  driver: DriverRecord
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim()
}

function normalizeDriverStatus(value: unknown): DriverStatus {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'offline' || status === 'available' || status === 'busy' || status === 'break') {
    return status
  }

  throw new Error('Forbidden')
}

export async function requireActiveDriver(
  req: Request,
  supabase: SupabaseClient
): Promise<AuthenticatedDriver> {
  const jwt = readBearerToken(req)
  if (!jwt) throw new Error('Unauthorized')

  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !userData.user) throw new Error('Unauthorized')

  const { data: driverRow, error: driverErr } = await supabase
    .from('drivers')
    .select('id, auth_user_id, name, phone_e164, status, active_order_id, is_active, login_email')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  if (driverErr) throw driverErr
  if (!driverRow?.is_active) throw new Error('Forbidden')

  return {
    user: userData.user,
    driver: {
      id: driverRow.id as string,
      auth_user_id: (driverRow.auth_user_id as string | null) ?? null,
      name: driverRow.name as string,
      phone_e164: driverRow.phone_e164 as string,
      status: normalizeDriverStatus(driverRow.status),
      active_order_id: (driverRow.active_order_id as string | null) ?? null,
      is_active: driverRow.is_active as boolean,
      login_email: (driverRow.login_email as string | null) ?? null,
    },
  }
}
