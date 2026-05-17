import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole } from '../_shared/staffAuth.ts'
import { driverStatusLabel, emitOperatorInAppNotification } from '../_shared/operatorInAppNotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type DriverStatus = 'offline' | 'available' | 'busy' | 'break'
type DriverAction = 'list' | 'create' | 'update' | 'set_status' | 'toggle_active' | 'delete'

interface DriverRequestBody {
  action?: DriverAction
  driver_id?: string
  name?: string
  phone_e164?: string
  vehicle_type?: string
  notes?: string | null
  login_email?: string | null
  password?: string | null
  status?: DriverStatus
  is_active?: boolean
}

function normalizeDriverStatus(value: unknown): DriverStatus {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'offline' || status === 'available' || status === 'busy' || status === 'break') {
    return status
  }

  throw new Error('Invalid driver status')
}

function normalizeEmail(value: unknown, required = false): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    if (required) throw new Error('login_email is required')
    return null
  }

  return normalized
}

function normalizePassword(value: unknown, required = false): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    if (required) throw new Error('password is required')
    return null
  }
  if (normalized.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }

  return normalized
}

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
) {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw error

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function listDriverRows(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('drivers')
    .select(`
      id,
      auth_user_id,
      login_email,
      name,
      phone_e164,
      vehicle_type,
      status,
      active_order_id,
      is_active,
      last_active_at,
      notes
    `)
    .order('status')
    .order('name')

  if (error) throw error
  return data ?? []
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  let stage = 'authenticate_staff'

  try {
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    const body = await req.json() as DriverRequestBody
    const action = body.action

    if (!action) {
      throw new Error('action is required')
    }

    if (action === 'list') {
      stage = 'list_drivers'
      const rows = await listDriverRows(supabase)
      return new Response(JSON.stringify({ success: true, data: rows }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'create') {
      stage = 'authorize_create'
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])

      const loginEmail = normalizeEmail(body.login_email, true)!
      const password = normalizePassword(body.password, true)!
      const name = String(body.name ?? '').trim()
      const phone = String(body.phone_e164 ?? '').trim()
      const vehicleType = String(body.vehicle_type ?? 'motorcycle').trim() || 'motorcycle'
      const notes = String(body.notes ?? '').trim() || null

      if (!name || !phone) {
        throw new Error('name and phone_e164 are required')
      }

      stage = 'create_auth_user'
      const { data: createdAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        app_metadata: {
          role: 'driver',
        },
      })

      if (createAuthError || !createdAuthUser.user) {
        throw createAuthError ?? new Error('Failed to create driver auth user')
      }

      stage = 'insert_driver'
      const { data: createdDriver, error: createDriverError } = await supabase
        .from('drivers')
        .insert({
          auth_user_id: createdAuthUser.user.id,
          login_email: loginEmail,
          name,
          phone_e164: phone,
          vehicle_type: vehicleType,
          notes,
          status: 'offline',
          is_active: true,
        })
        .select(`
          id,
          auth_user_id,
          login_email,
          name,
          phone_e164,
          vehicle_type,
          status,
          active_order_id,
          is_active,
          last_active_at,
          notes
        `)
        .single()

      if (createDriverError || !createdDriver) {
        await supabase.auth.admin.deleteUser(createdAuthUser.user.id)
        throw createDriverError ?? new Error('Failed to create driver')
      }

      stage = 'audit_create_driver'
      await supabase.from('audit_logs').insert({
        action: 'driver.created',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'driver',
        entity_id: createdDriver.id,
        metadata: {
          login_email: createdDriver.login_email,
          vehicle_type: createdDriver.vehicle_type,
        },
      })

      return new Response(JSON.stringify({ success: true, data: createdDriver }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const driverId = String(body.driver_id ?? '').trim()
    if (!driverId) {
      throw new Error('driver_id is required')
    }

    stage = 'load_driver'
    const { data: existingDriver, error: existingDriverError } = await supabase
      .from('drivers')
      .select(`
        id,
        auth_user_id,
        login_email,
        name,
        phone_e164,
        vehicle_type,
        status,
        active_order_id,
        is_active,
        last_active_at,
        notes
      `)
      .eq('id', driverId)
      .single()

    if (existingDriverError || !existingDriver) {
      throw existingDriverError ?? new Error('Driver not found')
    }

    if (action === 'update') {
      stage = 'authorize_update'
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])

      const loginEmail = normalizeEmail(body.login_email, false)
      const password = normalizePassword(body.password, false)
      let createdAuthUserId: string | null = null
      const updatePayload: Record<string, unknown> = {
        name: String(body.name ?? existingDriver.name).trim(),
        phone_e164: String(body.phone_e164 ?? existingDriver.phone_e164).trim(),
        vehicle_type: String(body.vehicle_type ?? existingDriver.vehicle_type).trim() || existingDriver.vehicle_type,
        notes: String(body.notes ?? existingDriver.notes ?? '').trim() || null,
      }

      if (!updatePayload.name || !updatePayload.phone_e164) {
        throw new Error('name and phone_e164 are required')
      }

      if (!existingDriver.auth_user_id && (loginEmail || password)) {
        if (!loginEmail || !password) {
          throw new Error('login_email and password are required to create a driver login')
        }

        stage = 'resolve_auth_user_for_existing_driver'
        const matchedAuthUser = await findAuthUserByEmail(supabase, loginEmail)

        if (matchedAuthUser) {
          const { data: linkedDriver, error: linkedDriverError } = await supabase
            .from('drivers')
            .select('id')
            .eq('auth_user_id', matchedAuthUser.id)
            .maybeSingle()

          if (linkedDriverError) throw linkedDriverError
          if (linkedDriver && linkedDriver.id !== driverId) {
            throw new Error('Login email is already linked to another driver')
          }

          stage = 'link_existing_auth_user'
          const { error: updateExistingAuthError } = await supabase.auth.admin.updateUserById(
            matchedAuthUser.id,
            {
              email: loginEmail,
              password,
              app_metadata: {
                ...(matchedAuthUser.app_metadata ?? {}),
                role: 'driver',
              },
            }
          )

          if (updateExistingAuthError) {
            throw updateExistingAuthError
          }

          updatePayload.auth_user_id = matchedAuthUser.id
          updatePayload.login_email = loginEmail
        } else {
          stage = 'create_auth_user_for_existing_driver'
          const { data: createdAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
            email: loginEmail,
            password,
            email_confirm: true,
            app_metadata: {
              role: 'driver',
            },
          })

          if (createAuthError || !createdAuthUser.user) {
            throw createAuthError ?? new Error('Failed to create driver auth user')
          }

          createdAuthUserId = createdAuthUser.user.id
          updatePayload.auth_user_id = createdAuthUserId
          updatePayload.login_email = loginEmail
        }
      }

      if (existingDriver.auth_user_id && (loginEmail || password)) {
        stage = 'update_auth_user'
        const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
          existingDriver.auth_user_id as string,
          {
            email: loginEmail ?? (existingDriver.login_email as string | null) ?? undefined,
            password: password ?? undefined,
          }
        )

        if (updateAuthError) throw updateAuthError
      }

      if (loginEmail) {
        updatePayload.login_email = loginEmail
      }

      stage = 'update_driver'
      const { data: updatedDriver, error: updateDriverError } = await supabase
        .from('drivers')
        .update(updatePayload)
        .eq('id', driverId)
        .select(`
          id,
          auth_user_id,
          login_email,
          name,
          phone_e164,
          vehicle_type,
          status,
          active_order_id,
          is_active,
          last_active_at,
          notes
        `)
        .single()

      if (updateDriverError || !updatedDriver) {
        if (createdAuthUserId) {
          await supabase.auth.admin.deleteUser(createdAuthUserId)
        }
        throw updateDriverError ?? new Error('Failed to update driver')
      }

      stage = 'audit_update_driver'
      await supabase.from('audit_logs').insert({
        action: 'driver.updated',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'driver',
        entity_id: updatedDriver.id,
        metadata: {
          login_email: updatedDriver.login_email,
          vehicle_type: updatedDriver.vehicle_type,
          auth_user_linked: !existingDriver.auth_user_id && !!updatedDriver.auth_user_id,
        },
      })

      return new Response(JSON.stringify({ success: true, data: updatedDriver }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'set_status') {
      stage = 'set_status'
      const status = normalizeDriverStatus(body.status)

      if (existingDriver.active_order_id && status !== 'busy') {
        throw new Error('Cannot move a driver out of busy while an active order is assigned')
      }

      const { data: updatedDriver, error: updateStatusError } = await supabase
        .from('drivers')
        .update({
          status,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', driverId)
        .select(`
          id,
          auth_user_id,
          login_email,
          name,
          phone_e164,
          vehicle_type,
          status,
          active_order_id,
          is_active,
          last_active_at,
          notes
        `)
        .single()

      if (updateStatusError || !updatedDriver) {
        throw updateStatusError ?? new Error('Failed to update driver status')
      }

      await supabase.from('audit_logs').insert({
        action: 'driver.status_updated',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'driver',
        entity_id: updatedDriver.id,
        metadata: {
          from_status: existingDriver.status,
          to_status: updatedDriver.status,
        },
      })

      await emitOperatorInAppNotification(supabase, {
        event_type: 'driver.status_changed',
        driver_id: updatedDriver.id,
        order_id: (updatedDriver.active_order_id as string | null) ?? null,
        title: `${updatedDriver.name} is now ${driverStatusLabel(updatedDriver.status)}`,
        message: `Ops set driver status to ${driverStatusLabel(updatedDriver.status)} (was ${driverStatusLabel(existingDriver.status)}).`,
        payload: {
          driver_id: updatedDriver.id,
          driver_name: updatedDriver.name,
          from_status: existingDriver.status,
          to_status: updatedDriver.status,
        },
      })

      return new Response(JSON.stringify({ success: true, data: updatedDriver }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'toggle_active') {
      stage = 'authorize_toggle_active'
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])

      if (existingDriver.active_order_id && body.is_active === false) {
        throw new Error('Cannot deactivate a driver with an active order')
      }

      const { data: updatedDriver, error: toggleActiveError } = await supabase
        .from('drivers')
        .update({
          is_active: body.is_active ?? !existingDriver.is_active,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', driverId)
        .select(`
          id,
          auth_user_id,
          login_email,
          name,
          phone_e164,
          vehicle_type,
          status,
          active_order_id,
          is_active,
          last_active_at,
          notes
        `)
        .single()

      if (toggleActiveError || !updatedDriver) {
        throw toggleActiveError ?? new Error('Failed to update driver activity')
      }

      await supabase.from('audit_logs').insert({
        action: 'driver.activity_toggled',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'driver',
        entity_id: updatedDriver.id,
        metadata: {
          from_is_active: existingDriver.is_active,
          to_is_active: updatedDriver.is_active,
        },
      })

      return new Response(JSON.stringify({ success: true, data: updatedDriver }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      stage = 'authorize_delete'
      requireStaffRole(authenticatedStaff, ['admin', 'manager'])

      if (existingDriver.active_order_id) {
        throw new Error('Cannot delete a driver with an active order')
      }

      if (existingDriver.auth_user_id) {
        stage = 'delete_auth_user'
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(existingDriver.auth_user_id as string)
        if (deleteAuthError) throw deleteAuthError
      }

      stage = 'delete_driver'
      const { error: deleteDriverError } = await supabase
        .from('drivers')
        .delete()
        .eq('id', driverId)

      if (deleteDriverError) throw deleteDriverError

      await supabase.from('audit_logs').insert({
        action: 'driver.deleted',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'driver',
        entity_id: driverId,
        metadata: {
          login_email: existingDriver.login_email,
          name: existingDriver.name,
        },
      })

      return new Response(JSON.stringify({ success: true, data: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unsupported action')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('manage-drivers failed', { stage, message })
    return new Response(JSON.stringify({ success: false, error: message, stage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
