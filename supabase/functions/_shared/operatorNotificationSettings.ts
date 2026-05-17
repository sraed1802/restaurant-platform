export type OperatorNotificationEvent = 'order.created' | 'order.cancelled'

export interface OperatorNotificationSettings {
  email_enabled: boolean
  email_recipients: string[]
  telegram_enabled: boolean
  telegram_chat_ids: string[]
  notify_on_order_created: boolean
  notify_on_order_cancelled: boolean
}

export const DEFAULT_OPERATOR_NOTIFICATION_SETTINGS: OperatorNotificationSettings = {
  email_enabled: false,
  email_recipients: [],
  telegram_enabled: false,
  telegram_chat_ids: [],
  notify_on_order_created: true,
  notify_on_order_cancelled: true,
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEGRAM_CHAT_ID_PATTERN = /^-?\d{5,20}$/

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

export function normalizeEmailRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return dedupe(
    value
      .map((entry) => String(entry ?? '').trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  )
}

export function normalizeTelegramChatIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return dedupe(
    value
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0)
  )
}

export function validateEmailRecipients(recipients: string[]): string[] {
  return recipients.filter((recipient) => !EMAIL_PATTERN.test(recipient))
}

export function validateTelegramChatIds(chatIds: string[]): string[] {
  return chatIds.filter((chatId) => !TELEGRAM_CHAT_ID_PATTERN.test(chatId))
}

export function coerceOperatorNotificationSettings(value: unknown): OperatorNotificationSettings {
  const record = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}

  return {
    email_enabled: record.email_enabled === true,
    email_recipients: normalizeEmailRecipients(record.email_recipients),
    telegram_enabled: record.telegram_enabled === true,
    telegram_chat_ids: normalizeTelegramChatIds(record.telegram_chat_ids),
    notify_on_order_created: record.notify_on_order_created !== false,
    notify_on_order_cancelled: record.notify_on_order_cancelled !== false,
  }
}

export function isOperatorNotificationEnabled(
  settings: OperatorNotificationSettings,
  eventType: OperatorNotificationEvent
): boolean {
  return eventType === 'order.created'
    ? settings.notify_on_order_created
    : settings.notify_on_order_cancelled
}
