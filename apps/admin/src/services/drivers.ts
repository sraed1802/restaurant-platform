import { supabase } from '../lib/supabase'

export type DriverStatus = 'offline' | 'available' | 'busy' | 'break'

export interface DriverAdminRecord {
  id: string
  name: string
  phone_e164: string
  vehicle_type: string
  status: DriverStatus
  active_order_id: string | null
  is_active: boolean
  last_active_at: string | null
  notes: string | null
  auth_user_id: string | null
  login_email: string | null
}

interface DriverFunctionResponse<T> {
  success?: boolean
  data?: T
  error?: string
}

interface DriverMutationInput {
  name?: string
  phone_e164?: string
  vehicle_type?: string
  notes?: string | null
  is_active?: boolean
  login_email?: string | null
  password?: string | null
}

async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Your admin session has expired. Please sign in again.')
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  }
}

async function invokeDriverFunction<T>(
  body: Record<string, unknown>
): Promise<T> {
  const headers = await getAuthHeaders()
  const { data, error } = await supabase.functions.invoke('manage-drivers', {
    body,
    headers,
  })

  if (error) {
    throw error
  }

  const payload = (data ?? {}) as DriverFunctionResponse<T>
  if (payload.success === false || payload.error) {
    throw new Error(payload.error || 'Driver request failed')
  }

  if (typeof payload.data === 'undefined') {
    throw new Error('Driver response payload was empty')
  }

  return payload.data
}

export async function listDrivers(): Promise<DriverAdminRecord[]> {
  return invokeDriverFunction<DriverAdminRecord[]>({
    action: 'list',
  })
}

export async function createDriver(input: Required<Pick<DriverMutationInput, 'name' | 'phone_e164' | 'vehicle_type'>> & {
  notes?: string | null
  login_email: string
  password: string
}): Promise<DriverAdminRecord> {
  return invokeDriverFunction<DriverAdminRecord>({
    action: 'create',
    ...input,
  })
}

export async function updateDriver(
  driverId: string,
  input: DriverMutationInput
): Promise<DriverAdminRecord> {
  return invokeDriverFunction<DriverAdminRecord>({
    action: 'update',
    driver_id: driverId,
    ...input,
  })
}

export async function setDriverStatus(
  driverId: string,
  status: DriverStatus
): Promise<DriverAdminRecord> {
  return invokeDriverFunction<DriverAdminRecord>({
    action: 'set_status',
    driver_id: driverId,
    status,
  })
}

export async function toggleDriverActive(
  driverId: string,
  isActive: boolean
): Promise<DriverAdminRecord> {
  return invokeDriverFunction<DriverAdminRecord>({
    action: 'toggle_active',
    driver_id: driverId,
    is_active: isActive,
  })
}

export async function deleteDriver(driverId: string): Promise<void> {
  await invokeDriverFunction<Record<string, never>>({
    action: 'delete',
    driver_id: driverId,
  })
}

export async function assignDriverToOrder(
  orderId: string,
  driverId: string
): Promise<{ driver_name: string }> {
  const headers = await getAuthHeaders()
  const { data, error } = await supabase.functions.invoke('assign-driver', {
    body: { order_id: orderId, driver_id: driverId },
    headers,
  })

  if (error) {
    throw error
  }

  const payload = (data ?? {}) as { success?: boolean; driver_name?: string; error?: string }
  if (payload.success === false || payload.error || !payload.driver_name) {
    throw new Error(payload.error || 'Failed to assign driver')
  }

  return { driver_name: payload.driver_name }
}
