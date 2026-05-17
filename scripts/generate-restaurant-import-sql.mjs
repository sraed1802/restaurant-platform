import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaultInputDir = join(__dirname, '..', 'supabase', 'import_templates')
const defaultOutputFile = join(__dirname, '..', 'supabase', 'generated', 'restaurant_import.generated.sql')

const restaurantSettingsFields = [
  ['restaurant_name_en', 'string'],
  ['restaurant_name_ar', 'string'],
  ['restaurant_tagline_en', 'string'],
  ['restaurant_tagline_ar', 'string'],
  ['logo_url', 'string'],
  ['contact_phone', 'string'],
  ['contact_email', 'string'],
  ['contact_address_en', 'string'],
  ['contact_address_ar', 'string'],
  ['social_facebook', 'string'],
  ['social_instagram', 'string'],
  ['social_twitter', 'string'],
  ['social_whatsapp', 'string'],
  ['delivery_banner_enabled', 'boolean'],
  ['delivery_banner_text_en', 'string'],
  ['delivery_banner_text_ar', 'string'],
  ['delivery_threshold', 'numeric'],
  ['currency_code', 'string'],
  ['primary_color', 'string'],
  ['secondary_color', 'string'],
  ['accent_color', 'string'],
  ['background_color', 'string'],
  ['surface_color', 'string'],
  ['text_color', 'string'],
  ['text_muted_color', 'string'],
  ['border_color', 'string'],
  ['font_family', 'string'],
  ['heading_font', 'string'],
  ['enable_service_dine_in', 'boolean'],
  ['enable_service_takeaway', 'boolean'],
  ['enable_service_delivery', 'boolean'],
  ['hero_title_en', 'string'],
  ['hero_title_ar', 'string'],
  ['hero_subtitle_en', 'string'],
  ['hero_subtitle_ar', 'string'],
  ['hero_image_url', 'string'],
  ['cancellation_policy_en', 'string'],
  ['cancellation_policy_ar', 'string'],
  ['meta_description_en', 'string'],
  ['meta_description_ar', 'string'],
]

function printHelp() {
  console.log(`Usage: node scripts/generate-restaurant-import-sql.mjs [--input <dir>] [--output <file>]

Reads the CSV files in supabase/import_templates and writes one SQL import file.

Defaults:
  input:  ${defaultInputDir}
  output: ${defaultOutputFile}`)
}

function parseArgs(argv) {
  const options = {
    inputDir: defaultInputDir,
    outputFile: defaultOutputFile,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }

    if (arg === '--input') {
      const next = argv[index + 1]
      if (!next) throw new Error('Missing value after --input')
      options.inputDir = resolve(next)
      index += 1
      continue
    }

    if (arg === '--output') {
      const next = argv[index + 1]
      if (!next) throw new Error('Missing value after --output')
      options.outputFile = resolve(next)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function esc(value) {
  return String(value).replace(/'/g, "''")
}

function nullable(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function sqlString(value) {
  const text = nullable(value)
  return text === null ? 'NULL' : `'${esc(text)}'`
}

function sqlBoolean(value) {
  const text = nullable(value)
  if (text === null) return 'NULL'
  const normalized = text.toLowerCase()
  if (['true', 't', '1', 'yes', 'y'].includes(normalized)) return 'true'
  if (['false', 'f', '0', 'no', 'n'].includes(normalized)) return 'false'
  throw new Error(`Invalid boolean value: ${value}`)
}

function sqlNumeric(value) {
  const text = nullable(value)
  if (text === null) return 'NULL'
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid numeric value: ${value}`)
  }
  return text
}

function sqlJsonb(value) {
  const text = nullable(value)
  if (text === null) return 'NULL'
  const parsed = JSON.parse(text)
  return `'${esc(JSON.stringify(parsed))}'::jsonb`
}

function sqlTypedConfigValue(type, value) {
  const normalizedType = String(type ?? '').trim().toLowerCase()

  if (normalizedType === 'json') {
    return sqlJsonb(value)
  }

  if (normalizedType === 'string') {
    const raw = value === undefined || value === null ? '' : String(value)
    return `to_jsonb(${sqlString(raw)}::text)`
  }

  if (normalizedType === 'number') {
    const numeric = sqlNumeric(value)
    if (numeric === 'NULL') return "'null'::jsonb"
    return `to_jsonb(${numeric}::numeric)`
  }

  if (normalizedType === 'boolean') {
    const bool = sqlBoolean(value)
    if (bool === 'NULL') return "'null'::jsonb"
    return `to_jsonb(${bool})`
  }

  if (normalizedType === 'null') {
    return "'null'::jsonb"
  }

  throw new Error(`Unsupported system_config value_type: ${type}`)
}

function sqlFromType(type, value) {
  switch (type) {
    case 'string':
      return sqlString(value)
    case 'boolean':
      return sqlBoolean(value)
    case 'numeric':
      return sqlNumeric(value)
    case 'json':
      return sqlJsonb(value)
    default:
      throw new Error(`Unsupported field type: ${type}`)
  }
}

function renderWhereEqualsOrNull(column, value) {
  return nullable(value) === null ? `${column} IS NULL` : `${column} = ${sqlString(value)}`
}

function renderScopeWhere(row) {
  return [
    renderWhereEqualsOrNull('organization_id', row.organization_id),
    renderWhereEqualsOrNull('cluster_id', row.cluster_id),
    renderWhereEqualsOrNull('property_id', row.property_id),
  ].join('\n  AND ')
}

function scopeKey(row) {
  return JSON.stringify([
    nullable(row.organization_id),
    nullable(row.cluster_id),
    nullable(row.property_id),
  ])
}

function groupByScope(rows) {
  const groups = new Map()

  for (const row of rows) {
    const key = scopeKey(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  return [...groups.values()]
}

function uniqueValues(rows, key) {
  return [...new Set(rows.map((row) => nullable(row[key])).filter((value) => value !== null))]
}

function parseCsv(text, fileName) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    cell += char
  }

  if (inQuotes) {
    throw new Error(`Unterminated quoted value in ${fileName}`)
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  if (rows.length === 0) return []

  const headers = rows[0].map((header) => header.trim())
  return rows
    .slice(1)
    .filter((cells) => cells.some((value) => String(value ?? '').trim() !== ''))
    .map((cells, index) => {
      if (cells.length > headers.length) {
        throw new Error(`Too many columns in ${fileName} at row ${index + 2}`)
      }

      const normalized = [...cells]
      while (normalized.length < headers.length) {
        normalized.push('')
      }

      const record = Object.create(null)
      headers.forEach((header, headerIndex) => {
        record[header] = String(normalized[headerIndex] ?? '').trim()
      })
      record.__rowNumber = index + 2
      return record
    })
}

function loadCsv(inputDir, fileName, { required = true } = {}) {
  const fullPath = join(inputDir, fileName)
  if (!existsSync(fullPath)) {
    if (!required) return []
    throw new Error(`Missing required CSV file: ${fullPath}`)
  }

  const text = readFileSync(fullPath, 'utf8')
  return parseCsv(text, fullPath)
}

function renderValues(rows, columnDefs) {
  return rows
    .map((row) => {
      const values = columnDefs.map(([column, type, sourceKey]) => sqlFromType(type, row[sourceKey ?? column]))
      return `  (${values.join(', ')})`
    })
    .join(',\n')
}

function renderRestaurantSettings(row) {
  const updateAssignments = restaurantSettingsFields
    .map(([key, type]) => `      ${key} = ${sqlFromType(type, row[key])}`)
    .join(',\n')

  const insertColumns = restaurantSettingsFields.map(([key]) => `      ${key}`).join(',\n')
  const insertValues = restaurantSettingsFields.map(([key, type]) => `      ${sqlFromType(type, row[key])}`).join(',\n')

  return `-- 1. Restaurant settings (singleton row used by customer/admin apps)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM restaurant_settings) THEN
    UPDATE restaurant_settings
    SET
${updateAssignments},
      updated_at = now();
  ELSE
    INSERT INTO restaurant_settings (
${insertColumns}
    ) VALUES (
${insertValues}
    );
  END IF;
END $$;`
}

function renderSystemConfig(rows) {
  if (rows.length === 0) return null

  const values = rows
    .map((row) => {
      const key = sqlString(row.key)
      const value = sqlTypedConfigValue(row.value_type, row.value)
      const description = sqlString(row.description)
      return `  (${key}, ${value}, ${description})`
    })
    .join(',\n')

  return `-- 2. Runtime config stored in system_config
INSERT INTO system_config (key, value, description)
VALUES
${values}
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();`
}

function renderFeatureFlags(rows) {
  if (rows.length === 0) return null

  const values = renderValues(rows, [
    ['flag_key', 'string'],
    ['description', 'string'],
    ['enabled', 'boolean'],
    ['rollout_percentage', 'numeric'],
    ['rules_json', 'json'],
    ['organization_id', 'string'],
    ['cluster_id', 'string'],
    ['property_id', 'string'],
  ])

  return `-- 3. Feature flags
INSERT INTO feature_flags (
  flag_key,
  description,
  enabled,
  rollout_percentage,
  rules,
  organization_id,
  cluster_id,
  property_id
)
VALUES
${values}
ON CONFLICT (flag_key, organization_id, cluster_id, property_id)
DO UPDATE SET
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  rollout_percentage = EXCLUDED.rollout_percentage,
  rules = EXCLUDED.rules,
  updated_at = now();`
}

function renderOrderAvailabilitySettings(rows) {
  if (rows.length === 0) return null

  return rows
    .map(
      (row) => `INSERT INTO order_availability_settings (
  organization_id,
  cluster_id,
  property_id,
  manual_mode,
  timezone,
  closure_message_en,
  closure_message_ar
) VALUES (
  ${sqlString(row.organization_id)},
  ${sqlString(row.cluster_id)},
  ${sqlString(row.property_id)},
  ${sqlString(row.manual_mode)},
  ${sqlString(row.timezone)},
  ${sqlString(row.closure_message_en)},
  ${sqlString(row.closure_message_ar)}
)
ON CONFLICT (organization_id, cluster_id, property_id)
DO UPDATE SET
  manual_mode = EXCLUDED.manual_mode,
  timezone = EXCLUDED.timezone,
  closure_message_en = EXCLUDED.closure_message_en,
  closure_message_ar = EXCLUDED.closure_message_ar,
  updated_at = now();`,
    )
    .join('\n\n')
}

function renderFulfillmentSettings(rows) {
  if (rows.length === 0) return null

  return `-- 4. Scoped fulfillment mode\n${rows
    .map(
      (row) => `INSERT INTO fulfillment_settings (
  organization_id,
  cluster_id,
  property_id,
  fulfillment_mode
) VALUES (
  ${sqlString(row.organization_id)},
  ${sqlString(row.cluster_id)},
  ${sqlString(row.property_id)},
  ${sqlString(row.fulfillment_mode)}
)
ON CONFLICT (organization_id, cluster_id, property_id)
DO UPDATE SET
  fulfillment_mode = EXCLUDED.fulfillment_mode,
  updated_at = now();`,
    )
    .join('\n\n')}`
}

function renderScopedReplace(tableName, rows, columnDefs, { heading, deleteFromSettingsScopes = false } = {}) {
  const sections = []
  const rowGroups = new Map(groupByScope(rows).map((group) => [scopeKey(group[0]), group]))
  const settingsScopeRows = deleteFromSettingsScopes ? orderAvailabilitySettingsRows : []
  const allScopeRows = new Map()

  for (const group of rowGroups.values()) {
    allScopeRows.set(scopeKey(group[0]), group[0])
  }
  for (const row of settingsScopeRows) {
    const key = scopeKey(row)
    if (!allScopeRows.has(key)) allScopeRows.set(key, row)
  }

  for (const row of allScopeRows.values()) {
    sections.push(`DELETE FROM ${tableName}\nWHERE ${renderScopeWhere(row)};`)

    const group = rowGroups.get(scopeKey(row)) ?? []
    if (group.length > 0) {
      sections.push(
        `INSERT INTO ${tableName} (\n${columnDefs.map(([key]) => `  ${key}`).join(',\n')}\n)\nVALUES\n${renderValues(group, columnDefs)};`,
      )
    }
  }

  if (sections.length === 0) return null
  return `-- ${heading}\n${sections.join('\n\n')}`
}

function renderStaff(rows) {
  if (rows.length === 0) return null

  const values = renderValues(rows, [
    ['id', 'string'],
    ['name', 'string'],
    ['phone', 'string'],
    ['app_role', 'string'],
    ['is_active', 'boolean'],
    ['created_by', 'string'],
  ])

  return `-- 5. Staff records
INSERT INTO staff (id, name, phone, app_role, is_active, created_by)
VALUES
${values}
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  app_role = EXCLUDED.app_role,
  is_active = EXCLUDED.is_active;`
}

function renderSimpleUpsert({ heading, table, rows, columns, conflict, updates, trailing = null }) {
  if (rows.length === 0) return null

  const values = renderValues(rows, columns)
  const updateLines = updates.map((line) => `  ${line}`).join(',\n')
  const trailingSql = trailing ? `,\n  ${trailing}` : ''

  return `-- ${heading}
INSERT INTO ${table} (
${columns.map(([column]) => `  ${column}`).join(',\n')}
)
VALUES
${values}
ON CONFLICT (${conflict.join(', ')}) DO UPDATE
SET
${updateLines}${trailingSql};`
}

function renderDeleteThenInsert({ heading, table, rows, keyColumn, columns, conflict, updates }) {
  if (rows.length === 0) return null

  const uniqueIds = uniqueValues(rows, keyColumn)
  const deleteClause = uniqueIds.length
    ? `DELETE FROM ${table}\nWHERE ${keyColumn} IN (${uniqueIds.map((value) => sqlString(value)).join(', ')});`
    : null

  const values = renderValues(rows, columns)
  const updateClause = updates?.length
    ? `\nON CONFLICT (${conflict.join(', ')}) DO UPDATE\nSET\n${updates.map((line) => `  ${line}`).join(',\n')};`
    : `\nON CONFLICT (${conflict.join(', ')}) DO NOTHING;`

  return `-- ${heading}
${deleteClause ? `${deleteClause}\n\n` : ''}INSERT INTO ${table} (
${columns.map(([column]) => `  ${column}`).join(',\n')}
)
VALUES
${values}${updateClause}`
}

const { inputDir, outputFile } = parseArgs(process.argv.slice(2))

const restaurantSettingsRows = loadCsv(inputDir, '01_restaurant_settings.csv')
const systemConfigRows = loadCsv(inputDir, '02_system_config.csv')
const featureFlagRows = loadCsv(inputDir, '02_feature_flags.csv')
const fulfillmentSettingsRows = loadCsv(inputDir, '16_fulfillment_settings.csv', { required: false })
const orderAvailabilitySettingsRows = loadCsv(inputDir, '03_order_availability_settings.csv')
const weeklyWindowRows = loadCsv(inputDir, '04_order_availability_weekly_windows.csv')
const overrideRows = loadCsv(inputDir, '05_order_availability_overrides.csv', { required: false })
const staffRows = loadCsv(inputDir, '06_staff.csv', { required: false })
const categoryRows = loadCsv(inputDir, '07_categories.csv', { required: false })
const productRows = loadCsv(inputDir, '08_products.csv', { required: false })
const modifierGroupRows = loadCsv(inputDir, '09_modifier_groups.csv', { required: false })
const modifierOptionRows = loadCsv(inputDir, '10_modifier_options.csv', { required: false })
const productModifierGroupRows = loadCsv(inputDir, '11_product_modifier_groups.csv', { required: false })
const promotionRows = loadCsv(inputDir, '12_promotions.csv', { required: false })
const promotionProductRows = loadCsv(inputDir, '13_promotion_products.csv', { required: false })
const comboPromotionRows = loadCsv(inputDir, '14_combo_promotions.csv', { required: false })
const comboPromotionItemRows = loadCsv(inputDir, '15_combo_promotion_items.csv', { required: false })
const hotelGuestRosterRows = loadCsv(inputDir, '17_hotel_guest_roster.csv', { required: false })

if (restaurantSettingsRows.length !== 1) {
  throw new Error('01_restaurant_settings.csv must contain exactly one data row')
}

if (orderAvailabilitySettingsRows.length === 0) {
  throw new Error('03_order_availability_settings.csv must contain at least one data row')
}

const sections = [
  `-- ============================================================
-- Generated restaurant import SQL
-- Source CSV directory: ${inputDir}
-- Generated at: ${new Date().toISOString()}
-- This file is safe to regenerate from the CSV templates.
-- ============================================================

BEGIN;`,
  renderRestaurantSettings(restaurantSettingsRows[0]),
  renderSystemConfig(systemConfigRows),
  renderFeatureFlags(featureFlagRows),
  renderFulfillmentSettings(fulfillmentSettingsRows),
  `-- 5. Order availability defaults\n${renderOrderAvailabilitySettings(orderAvailabilitySettingsRows)}`,
  renderScopedReplace(
    'order_availability_weekly_windows',
    weeklyWindowRows.sort((left, right) => Number(left.day_of_week) - Number(right.day_of_week)),
    [
      ['organization_id', 'string'],
      ['cluster_id', 'string'],
      ['property_id', 'string'],
      ['day_of_week', 'numeric'],
      ['opens_at', 'string'],
      ['closes_at', 'string'],
      ['is_enabled', 'boolean'],
    ],
    { heading: '5a. Weekly windows', deleteFromSettingsScopes: true },
  ),
  renderScopedReplace(
    'order_availability_overrides',
    overrideRows,
    [
      ['organization_id', 'string'],
      ['cluster_id', 'string'],
      ['property_id', 'string'],
      ['starts_at', 'string'],
      ['ends_at', 'string'],
      ['mode', 'string'],
      ['label', 'string'],
      ['message_en', 'string'],
      ['message_ar', 'string'],
    ],
    { heading: '5b. One-off overrides', deleteFromSettingsScopes: true },
  ),
  renderScopedReplace(
    'hotel_guest_roster',
    hotelGuestRosterRows,
    [
      ['organization_id', 'string'],
      ['cluster_id', 'string'],
      ['property_id', 'string'],
      ['room_number', 'string'],
      ['guest_name', 'string'],
      ['phone', 'string'],
      ['email', 'string'],
      ['check_in_date', 'string'],
      ['check_out_date', 'string'],
      ['notes', 'string'],
      ['source_file_name', 'string'],
    ],
    { heading: 'Optional hotel guest roster seed' },
  ),
  renderStaff(staffRows),
  renderSimpleUpsert({
    heading: '6a. Categories',
    table: 'categories',
    rows: categoryRows,
    columns: [
      ['id', 'string'],
      ['name_en', 'string'],
      ['name_ar', 'string'],
      ['description_en', 'string'],
      ['description_ar', 'string'],
      ['image_url', 'string'],
      ['display_order', 'numeric'],
      ['is_active', 'boolean'],
    ],
    conflict: ['id'],
    updates: [
      'name_en = EXCLUDED.name_en',
      'name_ar = EXCLUDED.name_ar',
      'description_en = EXCLUDED.description_en',
      'description_ar = EXCLUDED.description_ar',
      'image_url = EXCLUDED.image_url',
      'display_order = EXCLUDED.display_order',
      'is_active = EXCLUDED.is_active',
    ],
    trailing: 'updated_at = now()',
  }),
  renderSimpleUpsert({
    heading: '6b. Products',
    table: 'products',
    rows: productRows,
    columns: [
      ['id', 'string'],
      ['category_id', 'string'],
      ['name_en', 'string'],
      ['name_ar', 'string'],
      ['description_en', 'string'],
      ['description_ar', 'string'],
      ['base_price', 'numeric'],
      ['image_url', 'string'],
      ['is_available', 'boolean'],
      ['is_featured', 'boolean'],
      ['prep_time_minutes', 'numeric'],
      ['calories', 'numeric'],
      ['tags', 'json', 'tags_json'],
      ['display_order', 'numeric'],
    ],
    conflict: ['id'],
    updates: [
      'category_id = EXCLUDED.category_id',
      'name_en = EXCLUDED.name_en',
      'name_ar = EXCLUDED.name_ar',
      'description_en = EXCLUDED.description_en',
      'description_ar = EXCLUDED.description_ar',
      'base_price = EXCLUDED.base_price',
      'image_url = EXCLUDED.image_url',
      'is_available = EXCLUDED.is_available',
      'is_featured = EXCLUDED.is_featured',
      'prep_time_minutes = EXCLUDED.prep_time_minutes',
      'calories = EXCLUDED.calories',
      'tags = EXCLUDED.tags',
      'display_order = EXCLUDED.display_order',
    ],
    trailing: 'updated_at = now()',
  }),
  renderSimpleUpsert({
    heading: '6c. Modifier groups',
    table: 'modifier_groups',
    rows: modifierGroupRows,
    columns: [
      ['id', 'string'],
      ['name_en', 'string'],
      ['name_ar', 'string'],
      ['selection_type', 'string'],
      ['min_selections', 'numeric'],
      ['max_selections', 'numeric'],
      ['is_required', 'boolean'],
      ['display_order', 'numeric'],
    ],
    conflict: ['id'],
    updates: [
      'name_en = EXCLUDED.name_en',
      'name_ar = EXCLUDED.name_ar',
      'selection_type = EXCLUDED.selection_type',
      'min_selections = EXCLUDED.min_selections',
      'max_selections = EXCLUDED.max_selections',
      'is_required = EXCLUDED.is_required',
      'display_order = EXCLUDED.display_order',
    ],
  }),
  renderSimpleUpsert({
    heading: '6d. Modifier options',
    table: 'modifier_options',
    rows: modifierOptionRows,
    columns: [
      ['id', 'string'],
      ['group_id', 'string'],
      ['name_en', 'string'],
      ['name_ar', 'string'],
      ['price_delta', 'numeric'],
      ['is_default', 'boolean'],
      ['is_available', 'boolean'],
      ['display_order', 'numeric'],
    ],
    conflict: ['id'],
    updates: [
      'group_id = EXCLUDED.group_id',
      'name_en = EXCLUDED.name_en',
      'name_ar = EXCLUDED.name_ar',
      'price_delta = EXCLUDED.price_delta',
      'is_default = EXCLUDED.is_default',
      'is_available = EXCLUDED.is_available',
      'display_order = EXCLUDED.display_order',
    ],
  }),
  renderDeleteThenInsert({
    heading: '6e. Product modifier mappings',
    table: 'product_modifier_groups',
    rows: productModifierGroupRows,
    keyColumn: 'product_id',
    columns: [
      ['product_id', 'string'],
      ['group_id', 'string'],
      ['display_order', 'numeric'],
    ],
    conflict: ['product_id', 'group_id'],
    updates: ['display_order = EXCLUDED.display_order'],
  }),
  renderSimpleUpsert({
    heading: '7a. Promotions',
    table: 'promotions',
    rows: promotionRows,
    columns: [
      ['id', 'string'],
      ['code', 'string'],
      ['name_en', 'string'],
      ['name_ar', 'string'],
      ['type', 'string'],
      ['discount_value', 'numeric'],
      ['discount_type', 'string'],
      ['min_order_value', 'numeric'],
      ['max_discount_cap', 'numeric'],
      ['usage_limit', 'numeric'],
      ['usage_limit_per_customer', 'numeric'],
      ['conditions', 'json', 'conditions_json'],
      ['ai_rank_score', 'numeric'],
      ['is_active', 'boolean'],
      ['is_featured', 'boolean'],
      ['condition_type', 'string'],
      ['valid_from', 'string'],
      ['valid_until', 'string'],
      ['valid_from_time', 'string'],
      ['valid_until_time', 'string'],
    ],
    conflict: ['id'],
    updates: [
      'code = EXCLUDED.code',
      'name_en = EXCLUDED.name_en',
      'name_ar = EXCLUDED.name_ar',
      'type = EXCLUDED.type',
      'discount_value = EXCLUDED.discount_value',
      'discount_type = EXCLUDED.discount_type',
      'min_order_value = EXCLUDED.min_order_value',
      'max_discount_cap = EXCLUDED.max_discount_cap',
      'usage_limit = EXCLUDED.usage_limit',
      'usage_limit_per_customer = EXCLUDED.usage_limit_per_customer',
      'conditions = EXCLUDED.conditions',
      'ai_rank_score = EXCLUDED.ai_rank_score',
      'is_active = EXCLUDED.is_active',
      'is_featured = EXCLUDED.is_featured',
      'condition_type = EXCLUDED.condition_type',
      'valid_from = EXCLUDED.valid_from',
      'valid_until = EXCLUDED.valid_until',
      'valid_from_time = EXCLUDED.valid_from_time',
      'valid_until_time = EXCLUDED.valid_until_time',
    ],
    trailing: 'updated_at = now()',
  }),
  renderDeleteThenInsert({
    heading: '7b. Promotion product mappings',
    table: 'promotion_products',
    rows: promotionProductRows,
    keyColumn: 'promotion_id',
    columns: [
      ['promotion_id', 'string'],
      ['product_id', 'string'],
    ],
    conflict: ['promotion_id', 'product_id'],
    updates: [],
  }),
  renderSimpleUpsert({
    heading: '8a. Combo promotions',
    table: 'combo_promotions',
    rows: comboPromotionRows,
    columns: [
      ['id', 'string'],
      ['organization_id', 'string'],
      ['cluster_id', 'string'],
      ['property_id', 'string'],
      ['name_en', 'string'],
      ['name_ar', 'string'],
      ['headline_en', 'string'],
      ['headline_ar', 'string'],
      ['description_en', 'string'],
      ['description_ar', 'string'],
      ['promo_price', 'numeric'],
      ['original_price', 'numeric'],
      ['image_url', 'string'],
      ['model_asset_url', 'string'],
      ['badge_text_en', 'string'],
      ['badge_text_ar', 'string'],
      ['accent_color', 'string'],
      ['secondary_color', 'string'],
      ['starts_at', 'string'],
      ['ends_at', 'string'],
      ['is_active', 'boolean'],
      ['is_featured', 'boolean'],
      ['display_order', 'numeric'],
    ],
    conflict: ['id'],
    updates: [
      'name_en = EXCLUDED.name_en',
      'name_ar = EXCLUDED.name_ar',
      'headline_en = EXCLUDED.headline_en',
      'headline_ar = EXCLUDED.headline_ar',
      'description_en = EXCLUDED.description_en',
      'description_ar = EXCLUDED.description_ar',
      'promo_price = EXCLUDED.promo_price',
      'original_price = EXCLUDED.original_price',
      'image_url = EXCLUDED.image_url',
      'model_asset_url = EXCLUDED.model_asset_url',
      'badge_text_en = EXCLUDED.badge_text_en',
      'badge_text_ar = EXCLUDED.badge_text_ar',
      'accent_color = EXCLUDED.accent_color',
      'secondary_color = EXCLUDED.secondary_color',
      'starts_at = EXCLUDED.starts_at',
      'ends_at = EXCLUDED.ends_at',
      'is_active = EXCLUDED.is_active',
      'is_featured = EXCLUDED.is_featured',
      'display_order = EXCLUDED.display_order',
    ],
    trailing: 'updated_at = now()',
  }),
  renderDeleteThenInsert({
    heading: '8b. Combo promotion items',
    table: 'combo_promotion_items',
    rows: comboPromotionItemRows,
    keyColumn: 'combo_promotion_id',
    columns: [
      ['id', 'string'],
      ['organization_id', 'string'],
      ['cluster_id', 'string'],
      ['property_id', 'string'],
      ['combo_promotion_id', 'string'],
      ['product_id', 'string'],
      ['item_role', 'string'],
      ['quantity', 'numeric'],
      ['display_order', 'numeric'],
    ],
    conflict: ['id'],
    updates: [
      'combo_promotion_id = EXCLUDED.combo_promotion_id',
      'product_id = EXCLUDED.product_id',
      'item_role = EXCLUDED.item_role',
      'quantity = EXCLUDED.quantity',
      'display_order = EXCLUDED.display_order',
    ],
  }),
  'COMMIT;',
]

const sql = `${sections.filter(Boolean).join('\n\n')}\n`
mkdirSync(dirname(outputFile), { recursive: true })
writeFileSync(outputFile, sql, 'utf8')

console.log(`Generated ${outputFile}`)
console.log(
  JSON.stringify(
    {
      restaurant_settings: restaurantSettingsRows.length,
      system_config: systemConfigRows.length,
      feature_flags: featureFlagRows.length,
      fulfillment_settings: fulfillmentSettingsRows.length,
      order_availability_settings: orderAvailabilitySettingsRows.length,
      order_availability_weekly_windows: weeklyWindowRows.length,
      order_availability_overrides: overrideRows.length,
      hotel_guest_roster: hotelGuestRosterRows.length,
      staff: staffRows.length,
      categories: categoryRows.length,
      products: productRows.length,
      modifier_groups: modifierGroupRows.length,
      modifier_options: modifierOptionRows.length,
      product_modifier_groups: productModifierGroupRows.length,
      promotions: promotionRows.length,
      promotion_products: promotionProductRows.length,
      combo_promotions: comboPromotionRows.length,
      combo_promotion_items: comboPromotionItemRows.length,
    },
    null,
    2,
  ),
)
