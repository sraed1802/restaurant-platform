import { supabase } from '../lib/supabase'

type MenuTaxonomyAction = 'upsert_categories' | 'upsert_modifier_groups'

interface MenuTaxonomyResponse<T> {
  success?: boolean
  data?: T
  error?: string
}

export interface CategoryTemplateRow {
  system_id: string
  name_en: string
  name_ar: string
  description_en: string | null
  description_ar: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
}

export interface ModifierGroupTemplateRow {
  system_id: string
  name_en: string
  name_ar: string
  selection_type: 'single' | 'multiple'
  min_selections: number
  max_selections: number
  is_required: boolean
  display_order: number
}

interface ImportedSystemRow {
  system_id: string
  name_en: string
  name_ar: string
}

export interface MenuCsvImportSummary {
  created: number
  updated: number
  rows: ImportedSystemRow[]
}

interface ParsedCategoryRow {
  system_id: string | null
  name_en: string
  name_ar: string
  description_en: string | null
  description_ar: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
}

interface ParsedModifierGroupRow {
  system_id: string | null
  name_en: string
  name_ar: string
  selection_type: 'single' | 'multiple'
  min_selections: number
  max_selections: number
  is_required: boolean
  display_order: number
}

const CATEGORY_HEADERS = [
  'system_id',
  'name_en',
  'name_ar',
  'description_en',
  'description_ar',
  'image_url',
  'display_order',
  'is_active',
] as const

const MODIFIER_GROUP_HEADERS = [
  'system_id',
  'name_en',
  'name_ar',
  'selection_type',
  'min_selections',
  'max_selections',
  'is_required',
  'display_order',
] as const

async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Your admin session has expired. Please sign in again.')
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  }
}

async function invokeMenuTaxonomyFunction<T>(
  action: MenuTaxonomyAction,
  rows: ParsedCategoryRow[] | ParsedModifierGroupRow[]
): Promise<T> {
  const headers = await getAuthHeaders()
  const { data, error } = await supabase.functions.invoke('manage-menu-taxonomy', {
    body: {
      action,
      rows,
    },
    headers,
  })

  if (error) {
    throw error
  }

  const payload = (data ?? {}) as MenuTaxonomyResponse<T>
  if (payload.success === false || payload.error) {
    throw new Error(payload.error || 'Menu CSV import failed')
  }

  if (typeof payload.data === 'undefined') {
    throw new Error('Menu CSV import returned an empty response')
  }

  return payload.data
}

function toCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function buildCsv(headers: readonly string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map((row) => row.map(toCsvValue).join(','))].join('\r\n')
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function downloadCategoryTemplate(rows: CategoryTemplateRow[]): void {
  const csv = buildCsv(
    CATEGORY_HEADERS,
    rows.map((row) => [
      row.system_id,
      row.name_en,
      row.name_ar,
      row.description_en ?? '',
      row.description_ar ?? '',
      row.image_url ?? '',
      String(row.display_order),
      row.is_active ? 'true' : 'false',
    ])
  )

  triggerDownload('menu-categories-template.csv', csv)
}

export function downloadModifierGroupTemplate(rows: ModifierGroupTemplateRow[]): void {
  const csv = buildCsv(
    MODIFIER_GROUP_HEADERS,
    rows.map((row) => [
      row.system_id,
      row.name_en,
      row.name_ar,
      row.selection_type,
      String(row.min_selections),
      String(row.max_selections),
      row.is_required ? 'true' : 'false',
      String(row.display_order),
    ])
  )

  triggerDownload('menu-modifier-groups-template.csv', csv)
}

function parseCsvTable(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((parsedRow) => parsedRow.some((value) => value.trim().length > 0))
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

function parseRecordRows(
  csvText: string,
  requiredHeaders: readonly string[]
): Array<Record<string, string>> {
  const table = parseCsvTable(csvText)
  if (table.length === 0) {
    throw new Error('The uploaded CSV is empty.')
  }

  const headers = table[0].map(normalizeHeader)
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header))
  if (missingHeaders.length > 0) {
    throw new Error(`The CSV is missing required columns: ${missingHeaders.join(', ')}`)
  }

  return table.slice(1).map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() ?? ''
    })
    return record
  })
}

function asNullableString(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function asRequiredString(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${label} is required`)
  }
  return normalized
}

function asInteger(value: string, label: string, fallback = 0): number {
  const normalized = value.trim()
  if (!normalized) {
    return fallback
  }

  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a whole number`)
  }

  return parsed
}

function asBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return fallback
  }

  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  throw new Error(`Invalid boolean value "${value}"`)
}

function asSelectionType(value: string): 'single' | 'multiple' {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'single' || normalized === 'multiple') {
    return normalized
  }

  throw new Error('selection_type must be either "single" or "multiple"')
}

function parseCategoryRows(csvText: string): ParsedCategoryRow[] {
  return parseRecordRows(csvText, CATEGORY_HEADERS)
    .filter((record) => Object.values(record).some((value) => value.trim().length > 0))
    .map((record, index) => {
      try {
        return {
          system_id: asNullableString(record.system_id ?? ''),
          name_en: asRequiredString(record.name_en ?? '', 'name_en'),
          name_ar: asRequiredString(record.name_ar ?? '', 'name_ar'),
          description_en: asNullableString(record.description_en ?? ''),
          description_ar: asNullableString(record.description_ar ?? ''),
          image_url: asNullableString(record.image_url ?? ''),
          display_order: asInteger(record.display_order ?? '', 'display_order', 0),
          is_active: asBoolean(record.is_active ?? '', true),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid category row'
        throw new Error(`Category row ${index + 2}: ${message}`)
      }
    })
}

function parseModifierGroupRows(csvText: string): ParsedModifierGroupRow[] {
  return parseRecordRows(csvText, MODIFIER_GROUP_HEADERS)
    .filter((record) => Object.values(record).some((value) => value.trim().length > 0))
    .map((record, index) => {
      try {
        return {
          system_id: asNullableString(record.system_id ?? ''),
          name_en: asRequiredString(record.name_en ?? '', 'name_en'),
          name_ar: asRequiredString(record.name_ar ?? '', 'name_ar'),
          selection_type: asSelectionType(record.selection_type ?? ''),
          min_selections: asInteger(record.min_selections ?? '', 'min_selections', 0),
          max_selections: asInteger(record.max_selections ?? '', 'max_selections', 1),
          is_required: asBoolean(record.is_required ?? '', false),
          display_order: asInteger(record.display_order ?? '', 'display_order', 0),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid modifier group row'
        throw new Error(`Modifier group row ${index + 2}: ${message}`)
      }
    })
}

export async function importCategoriesCsv(csvText: string): Promise<MenuCsvImportSummary> {
  const rows = parseCategoryRows(csvText)
  if (rows.length === 0) {
    throw new Error('The categories CSV does not contain any data rows.')
  }

  return invokeMenuTaxonomyFunction<MenuCsvImportSummary>('upsert_categories', rows)
}

export async function importModifierGroupsCsv(csvText: string): Promise<MenuCsvImportSummary> {
  const rows = parseModifierGroupRows(csvText)
  if (rows.length === 0) {
    throw new Error('The modifier groups CSV does not contain any data rows.')
  }

  return invokeMenuTaxonomyFunction<MenuCsvImportSummary>('upsert_modifier_groups', rows)
}
