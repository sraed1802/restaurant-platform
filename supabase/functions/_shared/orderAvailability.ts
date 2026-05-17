import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type OrderAvailabilityManualMode = 'scheduled' | 'force_open' | 'force_closed'
export type OrderAvailabilityOverrideMode = 'open' | 'closed'

export interface OrderAvailabilityScope {
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
}

export interface OrderAvailabilityWeeklyWindow {
  id?: string
  organization_id?: string | null
  cluster_id?: string | null
  property_id?: string | null
  day_of_week: number
  opens_at: string
  closes_at: string
  is_enabled: boolean
  created_at?: string
  updated_at?: string
}

export interface OrderAvailabilityOverride {
  id?: string
  organization_id?: string | null
  cluster_id?: string | null
  property_id?: string | null
  starts_at: string
  ends_at: string
  mode: OrderAvailabilityOverrideMode
  label: string | null
  message_en: string | null
  message_ar: string | null
  created_at?: string
  updated_at?: string
}

export interface OrderAvailabilitySettings {
  id?: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  manual_mode: OrderAvailabilityManualMode
  timezone: string
  closure_message_en: string | null
  closure_message_ar: string | null
  weekly_windows: OrderAvailabilityWeeklyWindow[]
  overrides: OrderAvailabilityOverride[]
  created_at?: string
  updated_at?: string
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

const DEFAULT_TIMEZONE = 'Asia/Qatar'
const DEFAULT_WEEKLY_OPEN = '10:00:00'
const DEFAULT_WEEKLY_CLOSE = '23:00:00'
const NEXT_OPEN_SEARCH_MINUTES = 14 * 24 * 60

const formatterCache = new Map<string, Intl.DateTimeFormat>()

export const DEFAULT_ORDER_AVAILABILITY_SETTINGS: OrderAvailabilitySettings = {
  organization_id: null,
  cluster_id: null,
  property_id: null,
  manual_mode: 'force_open',
  timezone: DEFAULT_TIMEZONE,
  closure_message_en: 'Orders are currently closed.',
  closure_message_ar: 'الطلبات مغلقة حالياً.',
  weekly_windows: Array.from({ length: 7 }, (_, day_of_week) => ({
    day_of_week,
    opens_at: DEFAULT_WEEKLY_OPEN,
    closes_at: DEFAULT_WEEKLY_CLOSE,
    is_enabled: true,
  })),
  overrides: [],
}

function normalizeNullableText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function normalizeScopeValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeManualMode(value: unknown): OrderAvailabilityManualMode {
  return value === 'force_closed' || value === 'force_open' ? value : 'scheduled'
}

function normalizeOverrideMode(value: unknown): OrderAvailabilityOverrideMode {
  return value === 'open' ? 'open' : 'closed'
}

function normalizeTimezone(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return DEFAULT_TIMEZONE
  return value.trim()
}

function normalizeDayOfWeek(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 6) {
    throw new Error('Weekly schedule day_of_week must be between 0 and 6')
  }

  return numeric
}

function normalizeTimeValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/)
  if (!match) return fallback
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`
}

function normalizeDateTime(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`)
  }

  const normalized = new Date(value)
  if (Number.isNaN(normalized.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date-time`)
  }

  return normalized.toISOString()
}

function sortOverrides(overrides: OrderAvailabilityOverride[]): OrderAvailabilityOverride[] {
  return [...overrides].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

function defaultWeeklyWindows(): OrderAvailabilityWeeklyWindow[] {
  return DEFAULT_ORDER_AVAILABILITY_SETTINGS.weekly_windows.map((window) => ({ ...window }))
}

export function coerceOrderAvailabilityScope(value: unknown): OrderAvailabilityScope {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

  return {
    organization_id: normalizeScopeValue(raw.organization_id ?? raw.organizationId),
    cluster_id: normalizeScopeValue(raw.cluster_id ?? raw.clusterId),
    property_id: normalizeScopeValue(raw.property_id ?? raw.propertyId),
  }
}

export function coerceWeeklyWindows(value: unknown): OrderAvailabilityWeeklyWindow[] {
  const rawItems = Array.isArray(value) ? value : []
  const mergedByDay = new Map<number, OrderAvailabilityWeeklyWindow>()

  for (const rawItem of rawItems) {
    const raw = typeof rawItem === 'object' && rawItem !== null
      ? (rawItem as Record<string, unknown>)
      : {}
    const day_of_week = normalizeDayOfWeek(raw.day_of_week)
    const opens_at = normalizeTimeValue(raw.opens_at, DEFAULT_WEEKLY_OPEN)
    const closes_at = normalizeTimeValue(raw.closes_at, DEFAULT_WEEKLY_CLOSE)

    if (closes_at <= opens_at) {
      throw new Error(`Weekly schedule close time must be after open time for day ${day_of_week}`)
    }

    mergedByDay.set(day_of_week, {
      id: normalizeScopeValue(raw.id),
      organization_id: normalizeScopeValue(raw.organization_id),
      cluster_id: normalizeScopeValue(raw.cluster_id),
      property_id: normalizeScopeValue(raw.property_id),
      day_of_week,
      opens_at,
      closes_at,
      is_enabled: raw.is_enabled !== false,
      created_at: normalizeNullableText(raw.created_at),
      updated_at: normalizeNullableText(raw.updated_at),
    })
  }

  return defaultWeeklyWindows().map((fallbackWindow) => mergedByDay.get(fallbackWindow.day_of_week) ?? fallbackWindow)
}

export function coerceOverrides(value: unknown): OrderAvailabilityOverride[] {
  const rawItems = Array.isArray(value) ? value : []

  const overrides = rawItems.map((rawItem) => {
    const raw = typeof rawItem === 'object' && rawItem !== null
      ? (rawItem as Record<string, unknown>)
      : {}
    const starts_at = normalizeDateTime(raw.starts_at, 'Override starts_at')
    const ends_at = normalizeDateTime(raw.ends_at, 'Override ends_at')

    if (new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
      throw new Error('Override ends_at must be after starts_at')
    }

    return {
      id: normalizeScopeValue(raw.id),
      organization_id: normalizeScopeValue(raw.organization_id),
      cluster_id: normalizeScopeValue(raw.cluster_id),
      property_id: normalizeScopeValue(raw.property_id),
      starts_at,
      ends_at,
      mode: normalizeOverrideMode(raw.mode),
      label: normalizeNullableText(raw.label, 120),
      message_en: normalizeNullableText(raw.message_en, 280),
      message_ar: normalizeNullableText(raw.message_ar, 280),
      created_at: normalizeNullableText(raw.created_at),
      updated_at: normalizeNullableText(raw.updated_at),
    }
  })

  return sortOverrides(overrides)
}

export function coerceOrderAvailabilitySettings(
  value: unknown,
  scopeOverride?: Partial<OrderAvailabilityScope>,
): OrderAvailabilitySettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const scope = {
    ...coerceOrderAvailabilityScope(raw),
    ...scopeOverride,
  }

  return {
    id: normalizeScopeValue(raw.id),
    organization_id: scope.organization_id ?? null,
    cluster_id: scope.cluster_id ?? null,
    property_id: scope.property_id ?? null,
    manual_mode: normalizeManualMode(raw.manual_mode),
    timezone: normalizeTimezone(raw.timezone),
    closure_message_en: normalizeNullableText(raw.closure_message_en, 280) ?? DEFAULT_ORDER_AVAILABILITY_SETTINGS.closure_message_en,
    closure_message_ar: normalizeNullableText(raw.closure_message_ar, 280) ?? DEFAULT_ORDER_AVAILABILITY_SETTINGS.closure_message_ar,
    weekly_windows: coerceWeeklyWindows(raw.weekly_windows),
    overrides: coerceOverrides(raw.overrides),
    created_at: normalizeNullableText(raw.created_at),
    updated_at: normalizeNullableText(raw.updated_at),
  }
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  formatterCache.set(timezone, formatter)
  return formatter
}

function getZonedParts(date: Date, timezone: string): {
  weekday: number
  time: string
} {
  const formattedParts = getFormatter(timezone).formatToParts(date)
  const partMap = new Map(formattedParts.map((part) => [part.type, part.value]))
  const weekdayLabel = partMap.get('weekday') ?? 'Sun'
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return {
    weekday: weekdayMap[weekdayLabel] ?? 0,
    time: `${partMap.get('hour') ?? '00'}:${partMap.get('minute') ?? '00'}:${partMap.get('second') ?? '00'}`,
  }
}

function isWithinWeeklyWindow(settings: OrderAvailabilitySettings, now: Date): boolean {
  const zoned = getZonedParts(now, settings.timezone)
  const todayWindow = settings.weekly_windows.find((window) => window.day_of_week === zoned.weekday)
  if (!todayWindow || !todayWindow.is_enabled) return false
  return zoned.time >= todayWindow.opens_at && zoned.time < todayWindow.closes_at
}

function getActiveOverride(settings: OrderAvailabilitySettings, now: Date): OrderAvailabilityOverride | null {
  const nowTime = now.getTime()

  const activeOverrides = settings.overrides.filter((override) => {
    const startsAt = new Date(override.starts_at).getTime()
    const endsAt = new Date(override.ends_at).getTime()
    return startsAt <= nowTime && nowTime < endsAt
  })

  if (activeOverrides.length === 0) return null

  return [...activeOverrides].sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]
}

function resolveCurrentAvailability(
  settings: OrderAvailabilitySettings,
  now: Date,
): Omit<OrderAvailabilityStatus, 'next_open_at'> {
  if (settings.manual_mode === 'force_closed') {
    return {
      is_open_now: false,
      reason: 'force_closed',
      manual_mode: settings.manual_mode,
      timezone: settings.timezone,
      public_message_en: settings.closure_message_en,
      public_message_ar: settings.closure_message_ar,
      active_override: null,
    }
  }

  if (settings.manual_mode === 'force_open') {
    return {
      is_open_now: true,
      reason: 'force_open',
      manual_mode: settings.manual_mode,
      timezone: settings.timezone,
      public_message_en: null,
      public_message_ar: null,
      active_override: null,
    }
  }

  const activeOverride = getActiveOverride(settings, now)
  if (activeOverride) {
    const isOpenOverride = activeOverride.mode === 'open'
    return {
      is_open_now: isOpenOverride,
      reason: isOpenOverride ? 'override_open' : 'override_closed',
      manual_mode: settings.manual_mode,
      timezone: settings.timezone,
      public_message_en: isOpenOverride ? null : (activeOverride.message_en ?? settings.closure_message_en),
      public_message_ar: isOpenOverride ? null : (activeOverride.message_ar ?? settings.closure_message_ar),
      active_override: activeOverride,
    }
  }

  if (isWithinWeeklyWindow(settings, now)) {
    return {
      is_open_now: true,
      reason: 'weekly_schedule',
      manual_mode: settings.manual_mode,
      timezone: settings.timezone,
      public_message_en: null,
      public_message_ar: null,
      active_override: null,
    }
  }

  return {
    is_open_now: false,
    reason: 'outside_schedule',
    manual_mode: settings.manual_mode,
    timezone: settings.timezone,
    public_message_en: settings.closure_message_en,
    public_message_ar: settings.closure_message_ar,
    active_override: null,
  }
}

function findNextOpenAt(settings: OrderAvailabilitySettings, now: Date): string | null {
  if (settings.manual_mode === 'force_closed') return null

  const searchStart = new Date(now.getTime() + 60_000)

  for (let minuteOffset = 0; minuteOffset < NEXT_OPEN_SEARCH_MINUTES; minuteOffset += 1) {
    const candidate = new Date(searchStart.getTime() + minuteOffset * 60_000)
    if (resolveCurrentAvailability(settings, candidate).is_open_now) {
      candidate.setSeconds(0, 0)
      return candidate.toISOString()
    }
  }

  return null
}

export function evaluateOrderAvailability(
  settings: OrderAvailabilitySettings,
  now = new Date(),
): OrderAvailabilityStatus {
  const current = resolveCurrentAvailability(settings, now)

  return {
    ...current,
    next_open_at: current.is_open_now ? null : findNextOpenAt(settings, now),
  }
}

export async function loadOrderAvailabilitySettings(
  supabase: SupabaseClient,
  scope: OrderAvailabilityScope,
): Promise<OrderAvailabilitySettings> {
  let settingsQuery = supabase
    .from('order_availability_settings')
    .select('*')
    .limit(1)

  settingsQuery = scope.organization_id
    ? settingsQuery.eq('organization_id', scope.organization_id)
    : settingsQuery.is('organization_id', null)
  settingsQuery = scope.cluster_id
    ? settingsQuery.eq('cluster_id', scope.cluster_id)
    : settingsQuery.is('cluster_id', null)
  settingsQuery = scope.property_id
    ? settingsQuery.eq('property_id', scope.property_id)
    : settingsQuery.is('property_id', null)

  const { data: settingsRow, error: settingsError } = await settingsQuery.maybeSingle()
  if (settingsError) throw settingsError

  let weeklyQuery = supabase
    .from('order_availability_weekly_windows')
    .select('*')
    .order('day_of_week', { ascending: true })

  weeklyQuery = scope.organization_id
    ? weeklyQuery.eq('organization_id', scope.organization_id)
    : weeklyQuery.is('organization_id', null)
  weeklyQuery = scope.cluster_id
    ? weeklyQuery.eq('cluster_id', scope.cluster_id)
    : weeklyQuery.is('cluster_id', null)
  weeklyQuery = scope.property_id
    ? weeklyQuery.eq('property_id', scope.property_id)
    : weeklyQuery.is('property_id', null)

  const { data: weeklyRows, error: weeklyError } = await weeklyQuery
  if (weeklyError) throw weeklyError

  let overridesQuery = supabase
    .from('order_availability_overrides')
    .select('*')
    .order('starts_at', { ascending: true })

  overridesQuery = scope.organization_id
    ? overridesQuery.eq('organization_id', scope.organization_id)
    : overridesQuery.is('organization_id', null)
  overridesQuery = scope.cluster_id
    ? overridesQuery.eq('cluster_id', scope.cluster_id)
    : overridesQuery.is('cluster_id', null)
  overridesQuery = scope.property_id
    ? overridesQuery.eq('property_id', scope.property_id)
    : overridesQuery.is('property_id', null)

  const { data: overrideRows, error: overrideError } = await overridesQuery
  if (overrideError) throw overrideError

  return coerceOrderAvailabilitySettings(
    {
      ...DEFAULT_ORDER_AVAILABILITY_SETTINGS,
      ...((settingsRow ?? {}) as Record<string, unknown>),
      weekly_windows: weeklyRows ?? DEFAULT_ORDER_AVAILABILITY_SETTINGS.weekly_windows,
      overrides: overrideRows ?? [],
    },
    scope,
  )
}

export async function saveOrderAvailabilitySettings(
  supabase: SupabaseClient,
  settings: OrderAvailabilitySettings,
): Promise<OrderAvailabilitySettings> {
  const normalized = coerceOrderAvailabilitySettings(settings, settings)

  const { data: settingsRow, error: settingsError } = await supabase
    .from('order_availability_settings')
    .upsert({
      organization_id: normalized.organization_id,
      cluster_id: normalized.cluster_id,
      property_id: normalized.property_id,
      manual_mode: normalized.manual_mode,
      timezone: normalized.timezone,
      closure_message_en: normalized.closure_message_en,
      closure_message_ar: normalized.closure_message_ar,
    }, {
      onConflict: 'organization_id,cluster_id,property_id',
    })
    .select('*')
    .single()

  if (settingsError) throw settingsError

  let deleteWeeklyQuery = supabase
    .from('order_availability_weekly_windows')
    .delete()

  deleteWeeklyQuery = normalized.organization_id
    ? deleteWeeklyQuery.eq('organization_id', normalized.organization_id)
    : deleteWeeklyQuery.is('organization_id', null)
  deleteWeeklyQuery = normalized.cluster_id
    ? deleteWeeklyQuery.eq('cluster_id', normalized.cluster_id)
    : deleteWeeklyQuery.is('cluster_id', null)
  deleteWeeklyQuery = normalized.property_id
    ? deleteWeeklyQuery.eq('property_id', normalized.property_id)
    : deleteWeeklyQuery.is('property_id', null)

  const { error: deleteWeeklyError } = await deleteWeeklyQuery
  if (deleteWeeklyError) throw deleteWeeklyError

  const weeklyRows = normalized.weekly_windows.map((window) => ({
    organization_id: normalized.organization_id,
    cluster_id: normalized.cluster_id,
    property_id: normalized.property_id,
    day_of_week: window.day_of_week,
    opens_at: normalizeTimeValue(window.opens_at, DEFAULT_WEEKLY_OPEN),
    closes_at: normalizeTimeValue(window.closes_at, DEFAULT_WEEKLY_CLOSE),
    is_enabled: window.is_enabled,
  }))

  const { error: insertWeeklyError } = await supabase
    .from('order_availability_weekly_windows')
    .insert(weeklyRows)

  if (insertWeeklyError) throw insertWeeklyError

  let deleteOverridesQuery = supabase
    .from('order_availability_overrides')
    .delete()

  deleteOverridesQuery = normalized.organization_id
    ? deleteOverridesQuery.eq('organization_id', normalized.organization_id)
    : deleteOverridesQuery.is('organization_id', null)
  deleteOverridesQuery = normalized.cluster_id
    ? deleteOverridesQuery.eq('cluster_id', normalized.cluster_id)
    : deleteOverridesQuery.is('cluster_id', null)
  deleteOverridesQuery = normalized.property_id
    ? deleteOverridesQuery.eq('property_id', normalized.property_id)
    : deleteOverridesQuery.is('property_id', null)

  const { error: deleteOverridesError } = await deleteOverridesQuery
  if (deleteOverridesError) throw deleteOverridesError

  if (normalized.overrides.length > 0) {
    const overrideRows = normalized.overrides.map((override) => ({
      organization_id: normalized.organization_id,
      cluster_id: normalized.cluster_id,
      property_id: normalized.property_id,
      starts_at: override.starts_at,
      ends_at: override.ends_at,
      mode: override.mode,
      label: override.label,
      message_en: override.message_en,
      message_ar: override.message_ar,
    }))

    const { error: insertOverridesError } = await supabase
      .from('order_availability_overrides')
      .insert(overrideRows)

    if (insertOverridesError) throw insertOverridesError
  }

  return loadOrderAvailabilitySettings(supabase, normalized)
}
