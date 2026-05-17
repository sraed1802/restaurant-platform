import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2'

export type StaffRole = 'admin' | 'manager' | 'supervisor'

export interface StaffRecord {
  id: string
  name: string
  app_role: StaffRole
  is_active: boolean
}

export interface AuthenticatedStaff {
  user: User
  staff: StaffRecord
}

function normalizeStaffRole(value: unknown): StaffRole {
  const normalizedRole = String(value ?? '').trim().toLowerCase()
  if (normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'supervisor') {
    return normalizedRole
  }

  throw new Error('Forbidden')
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7).trim()
}

export async function requireActiveStaff(
  req: Request,
  supabase: SupabaseClient
): Promise<AuthenticatedStaff> {
  const jwt = readBearerToken(req)
  if (!jwt) throw new Error('Unauthorized')

  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !userData.user) throw new Error('Unauthorized')

  const { data: staffRow, error: staffErr } = await supabase
    .from('staff')
    .select('id, name, app_role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (staffErr) throw staffErr
  if (!staffRow?.is_active) throw new Error('Forbidden')

  const normalizedStaff: StaffRecord = {
    id: staffRow.id as string,
    name: staffRow.name as string,
    app_role: normalizeStaffRole(staffRow.app_role),
    is_active: staffRow.is_active as boolean,
  }

  return {
    user: userData.user,
    staff: normalizedStaff,
  }
}

export function requireStaffRole(
  authenticatedStaff: AuthenticatedStaff,
  allowedRoles: StaffRole[]
): void {
  if (!allowedRoles.includes(authenticatedStaff.staff.app_role)) {
    throw new Error('Forbidden')
  }
}
