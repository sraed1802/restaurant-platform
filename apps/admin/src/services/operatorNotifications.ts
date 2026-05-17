import { supabase } from '../lib/supabase'

export interface OperatorNotificationSettings {
  email_enabled: boolean
  email_recipients: string[]
  telegram_enabled: boolean
  telegram_chat_ids: string[]
  notify_on_order_created: boolean
  notify_on_order_cancelled: boolean
}

export interface OperatorNotificationSettingsResponse {
  settings: OperatorNotificationSettings
  telegram_token_configured: boolean
  can_edit: boolean
  can_view: boolean
}

export const DEFAULT_OPERATOR_NOTIFICATION_SETTINGS: OperatorNotificationSettings = {
  email_enabled: false,
  email_recipients: [],
  telegram_enabled: false,
  telegram_chat_ids: [],
  notify_on_order_created: true,
  notify_on_order_cancelled: true,
}

export function parseRecipientList(value: string): string[] {
  return [...new Set(
    value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  )]
}

export async function getOperatorNotificationSettings(): Promise<OperatorNotificationSettingsResponse> {
  const { data, error } = await supabase.functions.invoke('manage-operator-notifications', {
    body: { action: 'get_settings' },
  })

  if (error) throw error

  return {
    settings: data?.settings ?? DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
    telegram_token_configured: data?.telegram_token_configured === true,
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}

export async function updateOperatorNotificationSettings(input: {
  settings: OperatorNotificationSettings
  telegram_bot_token?: string | null
  clear_telegram_token?: boolean
}): Promise<OperatorNotificationSettingsResponse> {
  const { data, error } = await supabase.functions.invoke('manage-operator-notifications', {
    body: {
      action: 'update_settings',
      settings: input.settings,
      telegram_bot_token: input.telegram_bot_token ?? null,
      clear_telegram_token: input.clear_telegram_token === true,
    },
  })

  if (error) throw error

  return {
    settings: data?.settings ?? DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
    telegram_token_configured: data?.telegram_token_configured === true,
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}
