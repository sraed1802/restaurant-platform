import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!anonKey || !serviceRoleKey) {
  throw new Error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required')
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function ensureUser(email, password, role, name) {
  const { data: usersPage, error: listError } = await service.auth.admin.listUsers()
  if (listError) throw listError

  let user = usersPage.users.find((entry) => entry.email === email) ?? null

  if (!user) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  }

  const { error: staffError } = await service
    .from('staff')
    .upsert({
      id: user.id,
      name,
      app_role: role,
      is_active: true,
    })

  if (staffError) throw staffError

  return user
}

async function signIn(email, password) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function invokeJson(client, functionName, body) {
  const { data, error } = await client.functions.invoke(functionName, { body })
  if (error) throw error
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForNotificationEvents(orderId, expectedEvents) {
  const deadline = Date.now() + 5000

  while (Date.now() < deadline) {
    const { data, error } = await service
      .from('operator_notifications')
      .select('event_type')
      .eq('order_id', orderId)

    if (error) throw error

    const foundEvents = new Set((data ?? []).map((row) => row.event_type))
    if (expectedEvents.every((eventType) => foundEvents.has(eventType))) {
      return
    }

    await sleep(200)
  }

  throw new Error(`Timed out waiting for operator notifications: ${expectedEvents.join(', ')}`)
}

async function main() {
  const adminEmail = 'ops-admin@example.com'
  const managerEmail = 'ops-manager@example.com'
  const password = 'Password123!'

  const adminUser = await ensureUser(adminEmail, password, 'admin', 'Ops Admin')
  const managerUser = await ensureUser(managerEmail, password, 'manager', 'Ops Manager')

  const adminClient = await signIn(adminEmail, password)
  const managerClient = await signIn(managerEmail, password)

  const adminSettings = await invokeJson(adminClient, 'manage-operator-notifications', {
    action: 'get_settings',
  })

  let managerGetFailed = false
  try {
    await invokeJson(managerClient, 'manage-operator-notifications', {
      action: 'get_settings',
    })
  } catch (error) {
    managerGetFailed = true
  }

  const updatedSettings = await invokeJson(adminClient, 'manage-operator-notifications', {
    action: 'update_settings',
    settings: {
      email_enabled: false,
      email_recipients: [],
      telegram_enabled: false,
      telegram_chat_ids: [],
      notify_on_order_created: true,
      notify_on_order_cancelled: true,
    },
    telegram_bot_token: null,
    clear_telegram_token: false,
  })

  let managerUpdateFailed = false
  try {
    await invokeJson(managerClient, 'manage-operator-notifications', {
      action: 'update_settings',
      settings: {
        notify_on_order_created: false,
      },
    })
  } catch (error) {
    managerUpdateFailed = true
  }

  const { data: product, error: productError } = await service
    .from('products')
    .select('id')
    .eq('is_available', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .single()

  if (productError) throw productError

  const orderResponse = await invokeJson(adminClient, 'place-order', {
    phone_e164: '+97455550123',
    customer_name: 'Verification Guest',
    delivery_address: {
      street: 'Smoke Test Street',
      building: '10',
      floor: '2',
      apartment: '5',
      area: 'West Bay',
      city: 'Doha',
      instructions: 'Call on arrival',
    },
    items: [
      {
        product_id: product.id,
        quantity: 1,
        selected_modifier_option_ids: [],
      },
    ],
    payment_method: 'cash',
    language_pref: 'en',
  })

  const orderId = orderResponse.order_id

  await invokeJson(adminClient, 'advance-order-status', {
    order_id: orderId,
    to_status: 'cancelled',
    reason: 'Verification cancel flow',
  })

  await waitForNotificationEvents(orderId, ['order.created', 'order.cancelled'])

  const { data: notifications, error: notificationsError } = await service
    .from('operator_notifications')
    .select('id, event_type, title, message, order_id, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (notificationsError) throw notificationsError

  const { data: deliveries, error: deliveriesError } = await service
    .from('operator_notification_deliveries')
    .select('event_type, channel, recipient, status, error_message, order_id, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (deliveriesError) throw deliveriesError

  const { data: auditLogs, error: auditError } = await service
    .from('audit_logs')
    .select('action, actor_role, entity_type, entity_id, metadata, created_at')
    .eq('entity_id', orderId)
    .order('created_at', { ascending: true })

  if (auditError) throw auditError

  console.log(JSON.stringify({
    users: {
      admin_id: adminUser.id,
      manager_id: managerUser.id,
    },
    access_checks: {
      admin_can_view: adminSettings.success === true,
      admin_can_edit: updatedSettings.success === true,
      manager_get_failed: managerGetFailed,
      manager_update_failed: managerUpdateFailed,
    },
    order: {
      id: orderId,
      number: orderResponse.order_number,
    },
    notifications,
    deliveries,
    audit_logs: auditLogs,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
