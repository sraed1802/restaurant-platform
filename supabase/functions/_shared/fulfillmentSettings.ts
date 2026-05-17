import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  coerceOrderAvailabilityScope,
  type OrderAvailabilityScope,
} from './orderAvailability.ts'

export type FulfillmentMode = 'outside_delivery' | 'hotel_room_delivery'

export interface FulfillmentSettings {
  id?: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  fulfillment_mode: FulfillmentMode
  created_at?: string
  updated_at?: string
}

export interface HotelGuestRosterRow {
  room_number: string
  guest_name: string
  phone: string | null
  email: string | null
  check_in_date: string | null
  check_out_date: string | null
  notes: string | null
}

export const DEFAULT_FULFILLMENT_SETTINGS: FulfillmentSettings = {
  organization_id: null,
  cluster_id: null,
  property_id: null,
  fulfillment_mode: 'outside_delivery',
}

function normalizeNullableText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

function normalizeRequiredText(value: unknown, fieldName: string, maxLength = 120): string {
  const normalized = normalizeNullableText(value, maxLength)
  if (!normalized) {
    throw new Error(`${fieldName} is required`)
  }
  return normalized
}

function normalizeDate(value: unknown): string | null {
  const normalized = normalizeNullableText(value, 40)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Guest roster dates must be valid ISO or YYYY-MM-DD values')
  }
  return parsed.toISOString().slice(0, 10)
}

function normalizeFulfillmentMode(value: unknown): FulfillmentMode {
  return value === 'hotel_room_delivery' ? 'hotel_room_delivery' : 'outside_delivery'
}

function applyScopeFilters<TQuery extends {
  eq: (column: string, value: string) => TQuery
  is: (column: string, value: null) => TQuery
}>(query: TQuery, scope: OrderAvailabilityScope): TQuery {
  let scopedQuery = scope.organization_id
    ? query.eq('organization_id', scope.organization_id)
    : query.is('organization_id', null)
  scopedQuery = scope.cluster_id
    ? scopedQuery.eq('cluster_id', scope.cluster_id)
    : scopedQuery.is('cluster_id', null)
  scopedQuery = scope.property_id
    ? scopedQuery.eq('property_id', scope.property_id)
    : scopedQuery.is('property_id', null)
  return scopedQuery
}

export function coerceFulfillmentScope(value: unknown): OrderAvailabilityScope {
  return coerceOrderAvailabilityScope(value)
}

export function coerceFulfillmentSettings(
  value: unknown,
  scope: OrderAvailabilityScope
): FulfillmentSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    id: normalizeNullableText(raw.id),
    organization_id: scope.organization_id,
    cluster_id: scope.cluster_id,
    property_id: scope.property_id,
    fulfillment_mode: normalizeFulfillmentMode(raw.fulfillment_mode),
    created_at: normalizeNullableText(raw.created_at),
    updated_at: normalizeNullableText(raw.updated_at),
  }
}

export async function loadFulfillmentSettings(
  supabase: SupabaseClient,
  scope: OrderAvailabilityScope
): Promise<FulfillmentSettings> {
  let query = supabase
    .from('fulfillment_settings')
    .select('*')
    .limit(1)

  query = applyScopeFilters(query, scope)

  const { data, error } = await query.maybeSingle()
  if (error) throw error

  return coerceFulfillmentSettings(
    {
      ...DEFAULT_FULFILLMENT_SETTINGS,
      ...(data ?? {}),
    },
    scope,
  )
}

export async function saveFulfillmentSettings(
  supabase: SupabaseClient,
  settings: FulfillmentSettings
): Promise<FulfillmentSettings> {
  const normalized = coerceFulfillmentSettings(settings, settings)

  const { data, error } = await supabase
    .from('fulfillment_settings')
    .upsert(
      {
        organization_id: normalized.organization_id,
        cluster_id: normalized.cluster_id,
        property_id: normalized.property_id,
        fulfillment_mode: normalized.fulfillment_mode,
      },
      { onConflict: 'organization_id,cluster_id,property_id' },
    )
    .select('*')
    .single()

  if (error) throw error

  return coerceFulfillmentSettings(data, normalized)
}

export function coerceHotelGuestRosterRows(value: unknown): HotelGuestRosterRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('At least one guest roster row is required')
  }

  return value.map((rawRow, index) => {
    const raw = typeof rawRow === 'object' && rawRow !== null ? (rawRow as Record<string, unknown>) : {}
    return {
      room_number: normalizeRequiredText(raw.room_number, `room_number on row ${index + 1}`),
      guest_name: normalizeRequiredText(raw.guest_name, `guest_name on row ${index + 1}`, 160),
      phone: normalizeNullableText(raw.phone, 60),
      email: normalizeNullableText(raw.email, 160),
      check_in_date: normalizeDate(raw.check_in_date),
      check_out_date: normalizeDate(raw.check_out_date),
      notes: normalizeNullableText(raw.notes, 1000),
    }
  })
}

function dedupeHotelGuestRosterRows(rows: HotelGuestRosterRow[]): HotelGuestRosterRow[] {
  const deduped = new Map<string, HotelGuestRosterRow>()

  for (const row of rows) {
    const dedupeKey = `${row.room_number.trim().toLowerCase()}::${row.guest_name.trim().toLowerCase()}`
    deduped.set(dedupeKey, row)
  }

  return [...deduped.values()]
}

export async function getHotelGuestRosterSummary(
  supabase: SupabaseClient,
  scope: OrderAvailabilityScope
): Promise<{ entry_count: number; last_uploaded_at: string | null; last_source_file_name: string | null }> {
  let query = supabase
    .from('hotel_guest_roster')
    .select('created_at, source_file_name', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1)

  query = applyScopeFilters(query, scope)

  const { data, count, error } = await query
  if (error) throw error

  const latest = Array.isArray(data) ? data[0] : null
  return {
    entry_count: count ?? 0,
    last_uploaded_at: typeof latest?.created_at === 'string' ? latest.created_at : null,
    last_source_file_name: typeof latest?.source_file_name === 'string' ? latest.source_file_name : null,
  }
}

export async function replaceHotelGuestRoster(
  supabase: SupabaseClient,
  scope: OrderAvailabilityScope,
  rows: HotelGuestRosterRow[],
  sourceFileName: string | null,
): Promise<{ entry_count: number; last_uploaded_at: string | null; last_source_file_name: string | null }> {
  const dedupedRows = dedupeHotelGuestRosterRows(rows)
  let deleteQuery = supabase.from('hotel_guest_roster').delete()
  deleteQuery = applyScopeFilters(deleteQuery, scope)

  const { error: deleteError } = await deleteQuery
  if (deleteError) throw deleteError

  const { error: insertError } = await supabase.from('hotel_guest_roster').insert(
    dedupedRows.map((row) => ({
      organization_id: scope.organization_id,
      cluster_id: scope.cluster_id,
      property_id: scope.property_id,
      room_number: row.room_number,
      guest_name: row.guest_name,
      phone: row.phone,
      email: row.email,
      check_in_date: row.check_in_date,
      check_out_date: row.check_out_date,
      notes: row.notes,
      source_file_name: sourceFileName,
    })),
  )

  if (insertError) throw insertError

  return getHotelGuestRosterSummary(supabase, scope)
}

export async function lookupHotelGuestRosterByRoom(
  supabase: SupabaseClient,
  scope: OrderAvailabilityScope,
  roomNumber: string,
) {
  const normalizedRoomNumber = normalizeRequiredText(roomNumber, 'room_number')
  let query = supabase
    .from('hotel_guest_roster')
    .select('*')
    .eq('room_number', normalizedRoomNumber)
    .order('guest_name', { ascending: true })

  query = applyScopeFilters(query, scope)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}
