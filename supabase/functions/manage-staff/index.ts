// supabase/functions/manage-staff/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole, type StaffRole } from '../_shared/staffAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = (await req.json()) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''

    const actor = await requireActiveStaff(req, supabaseAdmin)

    const assertManagerStaffAccess = () => {
      requireStaffRole(actor, ['admin', 'manager'])
    }

    const loadTargetRole = async (staffId: string): Promise<StaffRole> => {
      const { data: row, error } = await supabaseAdmin
        .from('staff')
        .select('app_role')
        .eq('id', staffId)
        .maybeSingle()
      if (error) throw error
      const role = String(row?.app_role ?? '').toLowerCase()
      if (role === 'admin' || role === 'manager' || role === 'supervisor') {
        return role as StaffRole
      }
      throw new Error('Staff member not found')
    }

    const assertManagerCannotTouchAdmin = async (staffId: string) => {
      if (actor.staff.app_role !== 'manager') return
      const targetRole = await loadTargetRole(staffId)
      if (targetRole === 'admin') {
        throw new Error('Managers cannot view or modify administrator accounts')
      }
    }

    if (action === 'list') {
      assertManagerStaffAccess()

      let staffQuery = supabaseAdmin.from('staff').select('*').order('created_at', { ascending: true })
      if (actor.staff.app_role === 'manager') {
        staffQuery = staffQuery.neq('app_role', 'admin')
      }

      const { data: staff, error: staffError } = await staffQuery
      if (staffError) throw staffError

      const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers()
      if (authError) throw authError

      const formattedStaff = (staff ?? []).map((s: Record<string, unknown>) => {
        const authUser = users.find((u) => u.id === s.id)
        return {
          id: s.id as string,
          name: s.name as string,
          phone: s.phone as string | null,
          email: authUser?.email ?? '',
          app_role: s.app_role as string,
          is_active: s.is_active as boolean,
          created_at: s.created_at as string,
        }
      })

      return jsonResponse(formattedStaff)
    }

    if (action === 'create') {
      assertManagerStaffAccess()

      const email = String(body.email ?? '')
      const password = String(body.password ?? '')
      const name = String(body.name ?? '')
      const phone = body.phone != null ? String(body.phone) : ''
      const role = String(body.role ?? 'supervisor').toLowerCase() as StaffRole

      if (!email || !password || !name) {
        throw new Error('name, email, and password are required')
      }

      if (role !== 'admin' && role !== 'manager' && role !== 'supervisor') {
        throw new Error('Invalid role')
      }

      if (actor.staff.app_role === 'manager') {
        if (role === 'admin') {
          throw new Error('Managers cannot create administrator accounts')
        }
      }

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (authErr) throw authErr
      if (!authUser.user?.id) throw new Error('Auth user creation failed')

      const { error: staffErr } = await supabaseAdmin.from('staff').insert({
        id: authUser.user.id,
        name,
        phone: phone || null,
        app_role: role,
      })
      if (staffErr) throw staffErr

      return jsonResponse({ success: true, user_id: authUser.user.id })
    }

    if (action === 'get_config') {
      requireStaffRole(actor, ['admin', 'manager'])
      const key = String(body.key ?? '')
      if (actor.staff.app_role === 'manager' && !['delivery_fee', 'free_delivery_enabled'].includes(key)) {
        throw new Error('Forbidden')
      }
      const { data: config, error } = await supabaseAdmin.from('system_config').select('*').eq('key', key).maybeSingle()
      if (error) throw error
      return jsonResponse(config ?? { value: 0 })
    }

    if (action === 'set_config') {
      requireStaffRole(actor, ['admin', 'manager'])
      const key = String(body.key ?? '')
      if (actor.staff.app_role === 'manager' && key !== 'delivery_fee') {
        throw new Error('Forbidden')
      }
      const { error } = await supabaseAdmin.from('system_config').upsert({ key, value: body.value })
      if (error) throw error
      return jsonResponse({ success: true })
    }

    if (action === 'toggle_active') {
      assertManagerStaffAccess()
      const id = String(body.id ?? '')
      const is_active = Boolean(body.is_active)
      if (!id) throw new Error('id is required')

      await assertManagerCannotTouchAdmin(id)

      const { error } = await supabaseAdmin.from('staff').update({ is_active }).eq('id', id)
      if (error) throw error
      return jsonResponse({ success: true })
    }

    if (action === 'toggle_free_delivery') {
      requireStaffRole(actor, ['admin', 'manager'])
      const value = Boolean(body.value)
      const { error } = await supabaseAdmin
        .from('system_config')
        .upsert({ key: 'free_delivery_enabled', value: value ? 'true' : 'false' })
      if (error) throw error
      return jsonResponse({ success: true })
    }

    if (action === 'delete') {
      assertManagerStaffAccess()
      const id = String(body.id ?? '')
      if (!id) throw new Error('id is required')

      await assertManagerCannotTouchAdmin(id)

      const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (error) throw error
      return jsonResponse({ success: true })
    }

    throw new Error('Invalid action')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400
    return jsonResponse({ error: message }, status)
  }
})
