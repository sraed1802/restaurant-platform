import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
  coerceOperatorNotificationSettings,
  type OperatorNotificationSettings,
} from './operatorNotificationSettings.ts'
import {
  decryptOperatorSecret,
  encryptOperatorSecret,
} from './operatorSecretCrypto.ts'

const SETTINGS_KEY = 'operator_notifications'
const TELEGRAM_SECRET_KEY = 'telegram_bot_token'

interface OperatorSecretRow {
  key_name: string
  ciphertext: string
  iv: string
  key_version: number
}

export async function loadOperatorNotificationSettings(
  supabase: SupabaseClient
): Promise<OperatorNotificationSettings> {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (error) throw error
  if (!data?.value) return DEFAULT_OPERATOR_NOTIFICATION_SETTINGS

  return coerceOperatorNotificationSettings(data.value)
}

export async function saveOperatorNotificationSettings(
  supabase: SupabaseClient,
  settings: OperatorNotificationSettings,
  updatedBy: string
): Promise<void> {
  const { error } = await supabase.from('system_config').upsert({
    key: SETTINGS_KEY,
    value: settings,
    description: 'Operator notification channel settings',
    updated_by: updatedBy,
  })

  if (error) throw error
}

export async function loadTelegramTokenConfigured(
  supabase: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabase
    .from('operator_notification_secrets')
    .select('key_name')
    .eq('key_name', TELEGRAM_SECRET_KEY)
    .maybeSingle()
  if (error) throw error
  return Boolean(data?.key_name)
}

export async function loadTelegramToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('operator_notification_secrets')
    .select('key_name, ciphertext, iv, key_version')
    .eq('key_name', TELEGRAM_SECRET_KEY)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const masterKey = Deno.env.get('OPERATOR_SECRETS_MASTER_KEY') ?? ''
  return decryptOperatorSecret(
    (data as OperatorSecretRow).ciphertext,
    (data as OperatorSecretRow).iv,
    masterKey
  )
}

export async function saveTelegramToken(
  supabase: SupabaseClient,
  token: string,
  updatedBy: string
): Promise<void> {
  const normalizedToken = token.trim()
  if (!normalizedToken) {
    throw new Error('Telegram bot token is required')
  }

  const masterKey = Deno.env.get('OPERATOR_SECRETS_MASTER_KEY') ?? ''
  const encryptedSecret = await encryptOperatorSecret(normalizedToken, masterKey)

  const { error } = await supabase.from('operator_notification_secrets').upsert({
    key_name: TELEGRAM_SECRET_KEY,
    ciphertext: encryptedSecret.ciphertext,
    iv: encryptedSecret.iv,
    key_version: 1,
    updated_by: updatedBy,
  })

  if (error) throw error
}

export async function clearTelegramToken(
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('operator_notification_secrets')
    .delete()
    .eq('key_name', TELEGRAM_SECRET_KEY)

  if (error) throw error
}
