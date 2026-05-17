import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole } from '../_shared/staffAuth.ts'
import {
  coerceOperatorNotificationSettings,
  validateEmailRecipients,
  validateTelegramChatIds,
} from '../_shared/operatorNotificationSettings.ts'
import {
  clearTelegramToken,
  loadOperatorNotificationSettings,
  loadTelegramTokenConfigured,
  saveTelegramToken,
  saveOperatorNotificationSettings,
} from '../_shared/operatorNotificationStore.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SettingsRequestBody {
  action?: 'get_settings' | 'update_settings'
  settings?: Record<string, unknown>
  telegram_bot_token?: string | null
  clear_telegram_token?: boolean
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

  try {
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    const body = await req.json() as SettingsRequestBody
    const action = body.action ?? 'get_settings'

    if (action === 'get_settings') {
      requireStaffRole(authenticatedStaff, ['admin'])

      const [settings, telegramTokenConfigured] = await Promise.all([
        loadOperatorNotificationSettings(supabase),
        loadTelegramTokenConfigured(supabase),
      ])

      return new Response(JSON.stringify({
        success: true,
        settings,
        telegram_token_configured: telegramTokenConfigured,
        can_edit: true,
        can_view: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update_settings') {
      requireStaffRole(authenticatedStaff, ['admin'])

      if (body.telegram_bot_token && body.clear_telegram_token) {
        throw new Error('Provide a new Telegram token or clear the current one, not both')
      }

      const currentSettings = await loadOperatorNotificationSettings(supabase)
      const currentTelegramTokenConfigured = await loadTelegramTokenConfigured(supabase)
      const rawIncomingSettings = body.settings ?? {}

      const nextSettings = coerceOperatorNotificationSettings({
        ...currentSettings,
        ...rawIncomingSettings,
        email_recipients: rawIncomingSettings.email_recipients ?? currentSettings.email_recipients,
        telegram_chat_ids: rawIncomingSettings.telegram_chat_ids ?? currentSettings.telegram_chat_ids,
      })

      const invalidEmails = validateEmailRecipients(nextSettings.email_recipients)
      if (invalidEmails.length > 0) {
        throw new Error(`Invalid email recipients: ${invalidEmails.join(', ')}`)
      }

      const invalidChatIds = validateTelegramChatIds(nextSettings.telegram_chat_ids)
      if (invalidChatIds.length > 0) {
        throw new Error(`Invalid Telegram chat IDs: ${invalidChatIds.join(', ')}`)
      }

      if (nextSettings.email_enabled && nextSettings.email_recipients.length === 0) {
        throw new Error('At least one email recipient is required when email notifications are enabled')
      }

      const tokenProvided = typeof body.telegram_bot_token === 'string' && body.telegram_bot_token.trim().length > 0
      if (nextSettings.telegram_enabled && nextSettings.telegram_chat_ids.length === 0) {
        throw new Error('At least one Telegram chat ID is required when Telegram notifications are enabled')
      }

      if (
        nextSettings.telegram_enabled &&
        !tokenProvided &&
        !currentTelegramTokenConfigured &&
        body.clear_telegram_token !== true
      ) {
        throw new Error('A Telegram bot token is required before Telegram notifications can be enabled')
      }

      if (tokenProvided) {
        await saveTelegramToken(supabase, body.telegram_bot_token?.trim() ?? '', authenticatedStaff.staff.id)
      }

      if (body.clear_telegram_token === true) {
        await clearTelegramToken(supabase)
      }

      const finalTelegramTokenConfigured = body.clear_telegram_token === true
        ? false
        : tokenProvided || currentTelegramTokenConfigured

      if (nextSettings.telegram_enabled && !finalTelegramTokenConfigured) {
        throw new Error('Telegram notifications cannot be enabled without a configured bot token')
      }

      await saveOperatorNotificationSettings(supabase, nextSettings, authenticatedStaff.staff.id)

      await supabase.from('audit_logs').insert({
        action: 'operator_notifications.settings_updated',
        actor_id: authenticatedStaff.staff.id,
        actor_role: authenticatedStaff.staff.app_role,
        entity_type: 'system_config',
        entity_id: null,
        metadata: {
          key: 'operator_notifications',
          previous_settings: currentSettings,
          next_settings: nextSettings,
          telegram_token_updated: tokenProvided,
          telegram_token_cleared: body.clear_telegram_token === true,
        },
      })

      return new Response(JSON.stringify({
        success: true,
        settings: nextSettings,
        telegram_token_configured: finalTelegramTokenConfigured,
        can_edit: true,
        can_view: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Invalid action')
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
