import type { TenantScope } from '@rms/platform'
import { supabase } from '../lib/supabase'

export type OrderAvailabilityManualMode = 'scheduled' | 'force_open' | 'force_closed'
export type OrderAvailabilityOverrideMode = 'open' | 'closed'

export interface OrderAvailabilityWeeklyWindow {
  id?: string
  day_of_week: number
  opens_at: string
  closes_at: string
  is_enabled: boolean
}

export interface OrderAvailabilityOverride {
  id?: string
  starts_at: string
  ends_at: string
  mode: OrderAvailabilityOverrideMode
  label: string | null
  message_en: string | null
  message_ar: string | null
}

export interface OrderAvailabilitySettings {
  id?: string
  manual_mode: OrderAvailabilityManualMode
  timezone: string
  closure_message_en: string | null
  closure_message_ar: string | null
  weekly_windows: OrderAvailabilityWeeklyWindow[]
  overrides: OrderAvailabilityOverride[]
}

export interface OrderAvailabilityStatus {
  is_open_now: boolean
  reason:
    | 'force_open'
    | 'force_closed'
    | 'override_open'
    | 'override_closed'
    | 'weekly_schedule'
    | 'outside_schedule'
  manual_mode: OrderAvailabilityManualMode
  timezone: string
  next_open_at: string | null
  public_message_en: string | null
  public_message_ar: string | null
  active_override: OrderAvailabilityOverride | null
}

export interface OrderAvailabilityResponse {
  settings: OrderAvailabilitySettings
  status: OrderAvailabilityStatus
  can_edit: boolean
  can_view: boolean
}

const DEFAULT_OPEN_TIME = '10:00:00'
const DEFAULT_CLOSE_TIME = '23:00:00'

export const DEFAULT_ORDER_AVAILABILITY_SETTINGS: OrderAvailabilitySettings = {
  manual_mode: 'force_open',
  timezone: 'Asia/Qatar',
  closure_message_en: 'Orders are currently closed.',
  closure_message_ar: 'الطلبات مغلقة حالياً.',
  weekly_windows: Array.from({ length: 7 }, (_, day_of_week) => ({
    day_of_week,
    opens_at: DEFAULT_OPEN_TIME,
    closes_at: DEFAULT_CLOSE_TIME,
    is_enabled: true,
  })),
  overrides: [],
}

export function createEmptyOrderAvailabilityOverride(): OrderAvailabilityOverride {
  const now = new Date()
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  start.setHours(Math.max(start.getHours(), 9))
  const end = new Date(start.getTime() + 60 * 60 * 1000)

  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    mode: 'closed',
    label: '',
    message_en: '',
    message_ar: '',
  }
}

function normalizeWeeklyWindows(value: unknown): OrderAvailabilityWeeklyWindow[] {
  const incoming = Array.isArray(value) ? value : []
  const mapped = new Map<number, OrderAvailabilityWeeklyWindow>()

  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<OrderAvailabilityWeeklyWindow>
    if (typeof raw.day_of_week !== 'number') continue
    mapped.set(raw.day_of_week, {
      id: typeof raw.id === 'string' ? raw.id : undefined,
      day_of_week: raw.day_of_week,
      opens_at: typeof raw.opens_at === 'string' ? raw.opens_at : DEFAULT_OPEN_TIME,
      closes_at: typeof raw.closes_at === 'string' ? raw.closes_at : DEFAULT_CLOSE_TIME,
      is_enabled: raw.is_enabled !== false,
    })
  }

  return DEFAULT_ORDER_AVAILABILITY_SETTINGS.weekly_windows.map(
    (window) => mapped.get(window.day_of_week) ?? { ...window },
  )
}

function normalizeOverrides(value: unknown): OrderAvailabilityOverride[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const raw = item as Partial<OrderAvailabilityOverride>
      const mode: OrderAvailabilityOverrideMode = raw.mode === 'open' ? 'open' : 'closed'
      return {
        id: typeof raw.id === 'string' ? raw.id : undefined,
        starts_at: typeof raw.starts_at === 'string' ? raw.starts_at : new Date().toISOString(),
        ends_at: typeof raw.ends_at === 'string' ? raw.ends_at : new Date().toISOString(),
        mode,
        label: typeof raw.label === 'string' ? raw.label : null,
        message_en: typeof raw.message_en === 'string' ? raw.message_en : null,
        message_ar: typeof raw.message_ar === 'string' ? raw.message_ar : null,
      }
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

function normalizeSettings(value: unknown): OrderAvailabilitySettings {
  const raw = value && typeof value === 'object' ? (value as Partial<OrderAvailabilitySettings>) : {}

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    manual_mode:
      raw.manual_mode === 'scheduled' || raw.manual_mode === 'force_closed' || raw.manual_mode === 'force_open'
        ? raw.manual_mode
        : DEFAULT_ORDER_AVAILABILITY_SETTINGS.manual_mode,
    timezone:
      typeof raw.timezone === 'string' && raw.timezone.trim().length > 0
        ? raw.timezone.trim()
        : DEFAULT_ORDER_AVAILABILITY_SETTINGS.timezone,
    closure_message_en:
      typeof raw.closure_message_en === 'string'
        ? raw.closure_message_en
        : DEFAULT_ORDER_AVAILABILITY_SETTINGS.closure_message_en,
    closure_message_ar:
      typeof raw.closure_message_ar === 'string'
        ? raw.closure_message_ar
        : DEFAULT_ORDER_AVAILABILITY_SETTINGS.closure_message_ar,
    weekly_windows: normalizeWeeklyWindows(raw.weekly_windows),
    overrides: normalizeOverrides(raw.overrides),
  }
}

function normalizeStatus(value: unknown): OrderAvailabilityStatus {
  const raw = value && typeof value === 'object' ? (value as Partial<OrderAvailabilityStatus>) : {}

  return {
    is_open_now: raw.is_open_now === true,
    reason:
      raw.reason === 'force_open' ||
      raw.reason === 'force_closed' ||
      raw.reason === 'override_open' ||
      raw.reason === 'override_closed' ||
      raw.reason === 'weekly_schedule'
        ? raw.reason
        : 'outside_schedule',
    manual_mode:
      raw.manual_mode === 'scheduled' || raw.manual_mode === 'force_closed' || raw.manual_mode === 'force_open'
        ? raw.manual_mode
        : 'force_open',
    timezone:
      typeof raw.timezone === 'string' && raw.timezone.trim().length > 0
        ? raw.timezone.trim()
        : DEFAULT_ORDER_AVAILABILITY_SETTINGS.timezone,
    next_open_at: typeof raw.next_open_at === 'string' ? raw.next_open_at : null,
    public_message_en: typeof raw.public_message_en === 'string' ? raw.public_message_en : null,
    public_message_ar: typeof raw.public_message_ar === 'string' ? raw.public_message_ar : null,
    active_override: raw.active_override ? normalizeOverrides([raw.active_override])[0] ?? null : null,
  }
}

function toScopePayload(scope: TenantScope) {
  return {
    organization_id: scope.organizationId,
    cluster_id: scope.clusterId,
    property_id: scope.propertyId,
  }
}

export async function getOrderAvailabilitySettings(scope: TenantScope): Promise<OrderAvailabilityResponse> {
  const { data, error } = await supabase.functions.invoke('manage-order-availability', {
    body: {
      action: 'get_settings',
      scope: toScopePayload(scope),
    },
  })

  if (error) throw error

  return {
    settings: normalizeSettings(data?.settings),
    status: normalizeStatus(data?.status),
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}

/** Quick open/close for dashboard toggle — sets manual_mode without changing schedule config. */
export async function setOrderAvailabilityManualMode(
  scope: TenantScope,
  manualMode: OrderAvailabilityManualMode,
  currentSettings?: OrderAvailabilitySettings,
): Promise<OrderAvailabilityResponse> {
  const settings =
    currentSettings ?? (await getOrderAvailabilitySettings(scope)).settings
  return updateOrderAvailabilitySettings({
    scope,
    settings: { ...settings, manual_mode: manualMode },
  })
}

export async function updateOrderAvailabilitySettings(input: {
  scope: TenantScope
  settings: OrderAvailabilitySettings
}): Promise<OrderAvailabilityResponse> {
  const { data, error } = await supabase.functions.invoke('manage-order-availability', {
    body: {
      action: 'update_settings',
      scope: toScopePayload(input.scope),
      settings: input.settings,
    },
  })

  if (error) throw error

  return {
    settings: normalizeSettings(data?.settings),
    status: normalizeStatus(data?.status),
    can_edit: data?.can_edit === true,
    can_view: data?.can_view !== false,
  }
}
