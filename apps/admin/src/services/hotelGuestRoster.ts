import type { TenantScope } from '@rms/platform'
import { supabase } from '../lib/supabase'

export interface HotelGuestRosterRowInput {
  room_number: string
  guest_name: string
  phone?: string | null
  email?: string | null
  check_in_date?: string | null
  check_out_date?: string | null
  notes?: string | null
}

export interface HotelGuestRosterEntry extends HotelGuestRosterRowInput {
  id: string
  organization_id: string | null
  cluster_id: string | null
  property_id: string | null
  source_file_name: string | null
  created_at: string
  updated_at: string
}

export interface HotelGuestRosterSummary {
  entry_count: number
  last_uploaded_at: string | null
  last_source_file_name: string | null
}

function toScopePayload(scope: TenantScope) {
  return {
    organization_id: scope.organizationId,
    cluster_id: scope.clusterId,
    property_id: scope.propertyId,
  }
}

function parseCsvTable(input: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const nextChar = input[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue.trim())
      currentValue = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      currentRow.push(currentValue.trim())
      const hasContent = currentRow.some((value) => value.length > 0)
      if (hasContent) {
        rows.push(currentRow)
      }
      currentRow = []
      currentValue = ''
      continue
    }

    currentValue += char
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim())
    const hasContent = currentRow.some((value) => value.length > 0)
    if (hasContent) {
      rows.push(currentRow)
    }
  }

  return rows
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeNullableText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

export function parseHotelGuestRosterCsv(csvText: string): HotelGuestRosterRowInput[] {
  const rows = parseCsvTable(csvText)
  if (rows.length === 0) {
    throw new Error('The CSV file is empty')
  }

  const headers = rows[0].map(normalizeHeader)
  const roomIndex = headers.findIndex((header) => ['room_number', 'room', 'apartment_number', 'apartment'].includes(header))
  const guestIndex = headers.findIndex((header) => ['guest_name', 'guest', 'name', 'full_name'].includes(header))

  if (roomIndex === -1 || guestIndex === -1) {
    throw new Error('CSV must include room_number and guest_name columns')
  }

  const phoneIndex = headers.findIndex((header) => header === 'phone' || header === 'phone_e164')
  const emailIndex = headers.findIndex((header) => header === 'email')
  const checkInIndex = headers.findIndex((header) => header === 'check_in_date' || header === 'check_in')
  const checkOutIndex = headers.findIndex((header) => header === 'check_out_date' || header === 'check_out')
  const notesIndex = headers.findIndex((header) => header === 'notes' || header === 'comment')

  const parsedRows = rows
    .slice(1)
    .map((columns, rowIndex) => {
      const roomNumber = columns[roomIndex]?.trim() ?? ''
      const guestName = columns[guestIndex]?.trim() ?? ''

      if (!roomNumber || !guestName) {
        throw new Error(`Row ${rowIndex + 2} is missing room_number or guest_name`)
      }

      return {
        room_number: roomNumber,
        guest_name: guestName,
        phone: normalizeNullableText(columns[phoneIndex]),
        email: normalizeNullableText(columns[emailIndex]),
        check_in_date: normalizeNullableText(columns[checkInIndex]),
        check_out_date: normalizeNullableText(columns[checkOutIndex]),
        notes: normalizeNullableText(columns[notesIndex]),
      }
    })

  if (parsedRows.length === 0) {
    throw new Error('CSV must contain at least one guest row')
  }

  return parsedRows
}

export async function getHotelGuestRosterSummary(scope: TenantScope): Promise<HotelGuestRosterSummary> {
  const { data, error } = await supabase.functions.invoke('manage-hotel-guest-roster', {
    body: {
      action: 'get_summary',
      scope: toScopePayload(scope),
    },
  })

  if (error) throw error

  return {
    entry_count: Number(data?.summary?.entry_count ?? 0),
    last_uploaded_at: typeof data?.summary?.last_uploaded_at === 'string' ? data.summary.last_uploaded_at : null,
    last_source_file_name:
      typeof data?.summary?.last_source_file_name === 'string' ? data.summary.last_source_file_name : null,
  }
}

export async function replaceHotelGuestRoster(input: {
  scope: TenantScope
  rows: HotelGuestRosterRowInput[]
  sourceFileName: string
}): Promise<HotelGuestRosterSummary> {
  const { data, error } = await supabase.functions.invoke('manage-hotel-guest-roster', {
    body: {
      action: 'replace_roster',
      scope: toScopePayload(input.scope),
      rows: input.rows,
      source_file_name: input.sourceFileName,
    },
  })

  if (error) throw error

  return {
    entry_count: Number(data?.summary?.entry_count ?? input.rows.length),
    last_uploaded_at: typeof data?.summary?.last_uploaded_at === 'string' ? data.summary.last_uploaded_at : null,
    last_source_file_name:
      typeof data?.summary?.last_source_file_name === 'string' ? data.summary.last_source_file_name : null,
  }
}

export async function lookupHotelGuestByRoom(input: {
  scope: TenantScope
  roomNumber: string
}): Promise<HotelGuestRosterEntry[]> {
  const { data, error } = await supabase.functions.invoke('manage-hotel-guest-roster', {
    body: {
      action: 'lookup_room',
      scope: toScopePayload(input.scope),
      room_number: input.roomNumber,
    },
  })

  if (error) throw error

  return Array.isArray(data?.entries) ? (data.entries as HotelGuestRosterEntry[]) : []
}
