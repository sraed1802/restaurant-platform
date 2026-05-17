import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireActiveStaff, requireStaffRole } from '../_shared/staffAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type MenuTaxonomyAction = 'upsert_categories' | 'upsert_modifier_groups'
type ModifierSelectionType = 'single' | 'multiple'

interface CategoryCsvRow {
  system_id?: string | null
  name_en?: string
  name_ar?: string
  description_en?: string | null
  description_ar?: string | null
  image_url?: string | null
  display_order?: number
  is_active?: boolean
}

interface ModifierGroupCsvRow {
  system_id?: string | null
  name_en?: string
  name_ar?: string
  selection_type?: ModifierSelectionType
  min_selections?: number
  max_selections?: number
  is_required?: boolean
  display_order?: number
}

interface MenuTaxonomyRequestBody {
  action?: MenuTaxonomyAction
  rows?: unknown[]
}

interface ExistingNamedRow {
  id: string
  name_en: string
  name_ar: string
}

interface ImportResponseRow {
  system_id: string
  name_en: string
  name_ar: string
}

type SupabaseAdminClient = ReturnType<typeof createClient>

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeOptionalUuid(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('system_id must be a valid UUID')
  }

  return normalized
}

function normalizeRequiredString(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${label} is required`)
  }

  return normalized
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeInteger(value: unknown, label: string, fallback: number): number {
  if (value === null || typeof value === 'undefined' || value === '') {
    return fallback
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number`)
  }

  return parsed
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return fallback
  }

  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false

  throw new Error('Boolean fields must be true or false')
}

function normalizeSelectionType(value: unknown): ModifierSelectionType {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'single' || normalized === 'multiple') {
    return normalized
  }

  throw new Error('selection_type must be either "single" or "multiple"')
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeCategoryRow(row: unknown, rowNumber: number): Required<CategoryCsvRow> {
  const rawRow = typeof row === 'object' && row !== null ? (row as CategoryCsvRow) : {}
  return {
    system_id: normalizeOptionalUuid(rawRow.system_id),
    name_en: normalizeRequiredString(rawRow.name_en, `row ${rowNumber} name_en`),
    name_ar: normalizeRequiredString(rawRow.name_ar, `row ${rowNumber} name_ar`),
    description_en: normalizeOptionalString(rawRow.description_en),
    description_ar: normalizeOptionalString(rawRow.description_ar),
    image_url: normalizeOptionalString(rawRow.image_url),
    display_order: normalizeInteger(rawRow.display_order, `row ${rowNumber} display_order`, 0),
    is_active: normalizeBoolean(rawRow.is_active, true),
  }
}

function normalizeModifierGroupRow(row: unknown, rowNumber: number): Required<ModifierGroupCsvRow> {
  const rawRow = typeof row === 'object' && row !== null ? (row as ModifierGroupCsvRow) : {}
  const minSelections = normalizeInteger(rawRow.min_selections, `row ${rowNumber} min_selections`, 0)
  const maxSelections = normalizeInteger(rawRow.max_selections, `row ${rowNumber} max_selections`, 1)
  if (minSelections < 0 || maxSelections < 0) {
    throw new Error(`row ${rowNumber} selection values cannot be negative`)
  }
  if (maxSelections < minSelections) {
    throw new Error(`row ${rowNumber} max_selections cannot be smaller than min_selections`)
  }

  return {
    system_id: normalizeOptionalUuid(rawRow.system_id),
    name_en: normalizeRequiredString(rawRow.name_en, `row ${rowNumber} name_en`),
    name_ar: normalizeRequiredString(rawRow.name_ar, `row ${rowNumber} name_ar`),
    selection_type: normalizeSelectionType(rawRow.selection_type),
    min_selections: minSelections,
    max_selections: maxSelections,
    is_required: normalizeBoolean(rawRow.is_required, false),
    display_order: normalizeInteger(rawRow.display_order, `row ${rowNumber} display_order`, 0),
  }
}

async function loadExistingNamedRows(
  supabase: SupabaseAdminClient,
  table: 'categories' | 'modifier_groups'
): Promise<ExistingNamedRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select('id, name_en, name_ar')

  if (error) throw error
  return (data ?? []) as ExistingNamedRow[]
}

async function insertAuditLog(
  supabase: SupabaseAdminClient,
  payload: {
    actor_id: string
    actor_role: string
    action: string
    entity_type: string
    metadata: Record<string, unknown>
  }
) {
  const { error } = await supabase.from('audit_logs').insert({
    action: payload.action,
    actor_id: payload.actor_id,
    actor_role: payload.actor_role,
    entity_type: payload.entity_type,
    entity_id: null,
    metadata: payload.metadata,
  })

  if (error) throw error
}

async function upsertCategories(
  supabase: SupabaseAdminClient,
  rows: unknown[],
  actor: { id: string; role: string }
) {
  const normalizedRows = rows.map((row, index) => normalizeCategoryRow(row, index + 2))
  if (normalizedRows.length === 0) {
    throw new Error('rows are required')
  }

  const existingRows = await loadExistingNamedRows(supabase, 'categories')
  const idMap = new Map(existingRows.map((row) => [row.id, row]))
  const nameMap = new Map(existingRows.map((row) => [normalizeLookupKey(row.name_en), row]))
  const responseRows: ImportResponseRow[] = []
  let created = 0
  let updated = 0

  for (const row of normalizedRows) {
    const existingRow =
      (row.system_id ? idMap.get(row.system_id) : null) ?? nameMap.get(normalizeLookupKey(row.name_en)) ?? null
    const payload = {
      ...(existingRow ? {} : row.system_id ? { id: row.system_id } : {}),
      name_en: row.name_en,
      name_ar: row.name_ar,
      description_en: row.description_en,
      description_ar: row.description_ar,
      image_url: row.image_url,
      display_order: row.display_order,
      is_active: row.is_active,
    }

    if (existingRow) {
      const { data, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', existingRow.id)
        .select('id, name_en, name_ar')
        .single()

      if (error) {
        throw new Error(`Failed to update category "${row.name_en}": ${error.message}`)
      }

      updated += 1
      const savedRow = data as ExistingNamedRow
      idMap.set(savedRow.id, savedRow)
      nameMap.set(normalizeLookupKey(savedRow.name_en), savedRow)
      responseRows.push({
        system_id: savedRow.id,
        name_en: savedRow.name_en,
        name_ar: savedRow.name_ar,
      })
      continue
    }

    const { data, error } = await supabase
      .from('categories')
      .insert(payload)
      .select('id, name_en, name_ar')
      .single()

    if (error) {
      throw new Error(`Failed to create category "${row.name_en}": ${error.message}`)
    }

    created += 1
    const savedRow = data as ExistingNamedRow
    idMap.set(savedRow.id, savedRow)
    nameMap.set(normalizeLookupKey(savedRow.name_en), savedRow)
    responseRows.push({
      system_id: savedRow.id,
      name_en: savedRow.name_en,
      name_ar: savedRow.name_ar,
    })
  }

  await insertAuditLog(supabase, {
    actor_id: actor.id,
    actor_role: actor.role,
    action: 'menu.categories_csv_imported',
    entity_type: 'categories',
    metadata: {
      created,
      updated,
      row_count: normalizedRows.length,
    },
  })

  return {
    created,
    updated,
    rows: responseRows,
  }
}

async function upsertModifierGroups(
  supabase: SupabaseAdminClient,
  rows: unknown[],
  actor: { id: string; role: string }
) {
  const normalizedRows = rows.map((row, index) => normalizeModifierGroupRow(row, index + 2))
  if (normalizedRows.length === 0) {
    throw new Error('rows are required')
  }

  const existingRows = await loadExistingNamedRows(supabase, 'modifier_groups')
  const idMap = new Map(existingRows.map((row) => [row.id, row]))
  const nameMap = new Map(existingRows.map((row) => [normalizeLookupKey(row.name_en), row]))
  const responseRows: ImportResponseRow[] = []
  let created = 0
  let updated = 0

  for (const row of normalizedRows) {
    const existingRow =
      (row.system_id ? idMap.get(row.system_id) : null) ?? nameMap.get(normalizeLookupKey(row.name_en)) ?? null
    const payload = {
      ...(existingRow ? {} : row.system_id ? { id: row.system_id } : {}),
      name_en: row.name_en,
      name_ar: row.name_ar,
      selection_type: row.selection_type,
      min_selections: row.min_selections,
      max_selections: row.max_selections,
      is_required: row.is_required,
      display_order: row.display_order,
    }

    if (existingRow) {
      const { data, error } = await supabase
        .from('modifier_groups')
        .update(payload)
        .eq('id', existingRow.id)
        .select('id, name_en, name_ar')
        .single()

      if (error) {
        throw new Error(`Failed to update modifier group "${row.name_en}": ${error.message}`)
      }

      updated += 1
      const savedRow = data as ExistingNamedRow
      idMap.set(savedRow.id, savedRow)
      nameMap.set(normalizeLookupKey(savedRow.name_en), savedRow)
      responseRows.push({
        system_id: savedRow.id,
        name_en: savedRow.name_en,
        name_ar: savedRow.name_ar,
      })
      continue
    }

    const { data, error } = await supabase
      .from('modifier_groups')
      .insert(payload)
      .select('id, name_en, name_ar')
      .single()

    if (error) {
      throw new Error(`Failed to create modifier group "${row.name_en}": ${error.message}`)
    }

    created += 1
    const savedRow = data as ExistingNamedRow
    idMap.set(savedRow.id, savedRow)
    nameMap.set(normalizeLookupKey(savedRow.name_en), savedRow)
    responseRows.push({
      system_id: savedRow.id,
      name_en: savedRow.name_en,
      name_ar: savedRow.name_ar,
    })
  }

  await insertAuditLog(supabase, {
    actor_id: actor.id,
    actor_role: actor.role,
    action: 'menu.modifier_groups_csv_imported',
    entity_type: 'modifier_groups',
    metadata: {
      created,
      updated,
      row_count: normalizedRows.length,
    },
  })

  return {
    created,
    updated,
    rows: responseRows,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const authenticatedStaff = await requireActiveStaff(req, supabase)
    requireStaffRole(authenticatedStaff, ['admin'])

    const body = (await req.json()) as MenuTaxonomyRequestBody
    const action = body.action
    const rows = Array.isArray(body.rows) ? body.rows : []

    if (!action) {
      throw new Error('action is required')
    }

    if (action === 'upsert_categories') {
      const data = await upsertCategories(supabase, rows, {
        id: authenticatedStaff.staff.id,
        role: authenticatedStaff.staff.app_role,
      })
      return jsonResponse(200, { success: true, data })
    }

    if (action === 'upsert_modifier_groups') {
      const data = await upsertModifierGroups(supabase, rows, {
        id: authenticatedStaff.staff.id,
        role: authenticatedStaff.staff.app_role,
      })
      return jsonResponse(200, { success: true, data })
    }

    throw new Error('Unsupported action')
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})
