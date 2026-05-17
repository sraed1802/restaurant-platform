import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../apps/admin/.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars. Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/admin/.env'
  )
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ROOT_DIR = 'C:\\Users\\User\\Downloads\\Maazym Menu'
const BUCKET = 'menu'
const APPLY = process.argv.includes('--apply')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const MAX_RETRIES = 3
const CATEGORY_HINTS = {
  coffee: ['coffee and hot drinks'],
  'iced coffee': ['iced coffees'],
  milkshake: ['cold drinks'],
  mojito: ['cold drinks'],
  refreshments: ['cold drinks'],
  tea: ['tea and specialty hot beverages'],
  bakery: ['bakery and desserts'],
  breakfast: ['breakfast'],
  fatayer: ['fatayer'],
  'med sandwich': ['mediterranean specialties'],
  pasta: ['pasta'],
  pizza: ['pizza'],
  salad: ['salads'],
  starters: ['starters'],
  shisha: ['shisha'],
}

// Add only real mismatches you confirm from the dry run output.
const NAME_OVERRIDES = {
  capuccino: 'cappuccino',
  'mocha late': 'mocha latte',
  'mocca latte': 'mocha latte',
  'iced mocca latte': 'iced mocha latte',
  afogato: 'affogato',
  macchiato: 'espresso macchiato',
  turkish: 'turkish coffee',
  morocan: 'moroccan',
  'morocan tea': 'moroccan tea',
  strowberry: 'strawberry',
  'strowberry mojito': 'strawberry mojito',
  'passion fruits mojito': 'passion fruit mojito',
  'tuisian lemonade': 'tunisian lemonade',
  'baklawa tea': 'baklawa tea',
  chocolate: 'chocolate milkshake',
  mango: 'mango milkshake',
  smoothie: 'smoothie maazym',
  'vanilla 2': 'vanilla milkshake',
  'cheese cake': 'cheesecake',
  jwajem: 'juazym maazym',
  'tunisian tea almond': 'tunisian mint tea with almonds and hazelnut',
  'tunisian tea hazelnuts': 'tunisian mint tea with almonds and hazelnut',
  '4 fromages': 'quattro formaggi',
  '4 seasons pizza': 'four seasons',
  'buratta pizza': 'burrata',
  margheritta: 'margherita',
  'regina pizza': 'regina',
  'tuna and onion pizza': 'tuna cipolla',
  'very veggie': 'vegetarian',
  'ceasar salad a': 'caesar salad',
  'niceoise salad': 'nicoise salad',
  'mozarella stick': 'mozzarella sticks',
  'smoked ham sandwich': 'smoked sandwich',
  'taco beef': 'french tacos beef',
  'tacos beef': 'french tacos beef',
  'tacos checken': 'french tacos chicken',
  'mediterranian breakfast': 'mediterranean breakfast',
  pancake: 'pancakes',
  muffins: 'muffin',
  'penne bolognese': 'bolognese',
  'spaghetti bolognese': 'bolognese',
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[^.]+$/, '')
    .replace(/\(\s*\d+(?:\.\d+)?\s*\)\s*$/g, '')
    .replace(/&/g, ' and ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikePlaceholder(name) {
  return ['image', 'img', 'photo', 'picture'].includes(normalize(name))
}

function looksLikeNonProductAsset(filePath, stem) {
  const normalizedPath = normalize(filePath.replace(/\\/g, ' '))
  const normalizedStem = normalize(stem)

  if (normalizedPath.includes(' logo ')) return 'logo asset'
  if (/^img\s+\d+$/.test(normalizedStem)) return 'camera export filename'

  return null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(label, fn) {
  let lastError

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === MAX_RETRIES) break
      console.warn(`${label} failed on attempt ${attempt}/${MAX_RETRIES}. Retrying...`)
      await sleep(attempt * 1000)
    }
  }

  throw lastError
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(fullPath)
      return [fullPath]
    })
  )
  return files.flat()
}

function buildProductIndex(products) {
  const index = new Map()

  for (const product of products) {
    const candidateKeys = buildProductAliases(product)

    for (const key of candidateKeys) {
      if (!key) continue
      const values = index.get(key) ?? []
      values.push(product)
      index.set(key, values)
    }
  }

  return index
}

function buildProductAliases(product) {
  const aliases = new Set()
  const baseNames = [product.name_en, product.name_ar].filter(Boolean).map((name) => normalize(name))

  for (const baseName of baseNames) {
    if (!baseName) continue

    aliases.add(baseName)
    aliases.add(baseName.replace(/^maazym\s+/, '').trim())
    aliases.add(baseName.replace(/\s+maazym$/, '').trim())
    aliases.add(baseName.replace(/\s+and\s+/g, ' ').trim())

    if (baseName.endsWith(' milkshake')) {
      aliases.add(baseName.replace(/\s+milkshake$/, '').trim())
    }

    if (baseName.endsWith(' mojito')) {
      aliases.add(baseName.replace(/\s+mojito$/, '').trim())
    }

    if (baseName.endsWith(' coffee')) {
      aliases.add(baseName.replace(/\s+coffee$/, '').trim())
    }

    if (baseName.includes(' mint tea')) {
      aliases.add(baseName.replace(/\s+mint tea/, ' tea').trim())
      aliases.add(baseName.replace(/\s+mint\s+/g, ' ').trim())
    }

    if (baseName === 'espresso macchiato') {
      aliases.add('macchiato')
    }

    if (baseName === 'turkish coffee') {
      aliases.add('turkish')
    }
  }

  return [...aliases].filter(Boolean)
}

function getMimeType(ext) {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg'
  }
}

async function ensureBucket() {
  const { data: buckets, error } = await withRetry('listBuckets', () => supabase.storage.listBuckets())
  if (error) throw error

  const exists = (buckets ?? []).some((bucket) => bucket.name === BUCKET)
  if (exists) return

  const { error: createError } = await withRetry('createBucket', () =>
    supabase.storage.createBucket(BUCKET, {
      public: true,
    })
  )
  if (createError) throw createError
}

async function fetchProducts() {
  const { data, error } = await withRetry('fetchProducts', () =>
    supabase
      .from('products')
      .select('id, category_id, name_en, name_ar, image_url')
      .order('name_en', { ascending: true })
  )

  if (error) throw error
  return data ?? []
}

async function fetchCategories() {
  const { data, error } = await withRetry('fetchCategories', () =>
    supabase
      .from('categories')
      .select('id, name_en, name_ar')
      .order('display_order', { ascending: true })
  )

  if (error) throw error
  return data ?? []
}

function getFileContext(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const stem = path.basename(filePath, ext)
  const normalizedStem = normalize(stem)
  const pathSegments = filePath
    .split(path.sep)
    .map((segment) => normalize(segment))
    .filter(Boolean)
  const categoryHints = new Set()

  if (looksLikePlaceholder(stem)) {
    return { type: 'skip', reason: 'placeholder filename', normalizedStem }
  }

  const nonProductReason = looksLikeNonProductAsset(filePath, stem)
  if (nonProductReason) {
    return { type: 'skip', reason: nonProductReason, normalizedStem }
  }

  for (const segment of pathSegments) {
    const hints = CATEGORY_HINTS[segment] ?? []
    for (const hint of hints) {
      categoryHints.add(normalize(hint))
    }
  }

  return {
    type: 'context',
    filePath,
    ext,
    stem,
    normalizedStem,
    pathSegments,
    categoryHints,
  }
}

function scoreCandidate(product, fileContext, boost) {
  let score = boost
  const normalizedName = normalize(product.name_en ?? '')
  const normalizedCategory = normalize(product.category_name_en ?? '')

  for (const segment of fileContext.pathSegments) {
    if (segment === 'milkshake' && normalizedName.includes('milkshake')) score += 40
    if (segment === 'mojito' && normalizedName.includes('mojito')) score += 40
    if (segment === 'tea' && normalizedName.includes('tea')) score += 25
    if (segment === 'coffee' && normalizedCategory === 'coffee and hot drinks') score += 25
    if (segment === 'iced coffee' && normalizedCategory === 'iced coffees') score += 25
  }

  if (fileContext.categoryHints.has(normalizedCategory)) {
    score += 60
  }

  return score
}

function resolveFileMatch(filePath, productIndex) {
  const fileContext = getFileContext(filePath)

  if (fileContext.type === 'skip') {
    return { type: 'skip', reason: fileContext.reason, normalizedStem: fileContext.normalizedStem }
  }

  const keysToTry = buildFileCandidateKeys(fileContext)
  const candidateMap = new Map()

  for (const { key, boost } of keysToTry) {
    const matches = productIndex.get(key) ?? []
    for (const match of matches) {
      const score = scoreCandidate(match, fileContext, boost)
      const existing = candidateMap.get(match.id)
      if (!existing || score > existing.score) {
        candidateMap.set(match.id, { product: match, score })
      }
    }
  }

  const candidates = [...candidateMap.values()].sort((left, right) => right.score - left.score)

  if (candidates.length === 0) {
    return { type: 'unmatched', normalizedStem: fileContext.normalizedStem }
  }

  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return {
      type: 'ambiguous',
      normalizedStem: fileContext.normalizedStem,
      candidates: candidates.map((item) => item.product),
    }
  }

  return {
    type: 'matched',
    normalizedStem: fileContext.normalizedStem,
    product: candidates[0].product,
    score: candidates[0].score,
  }
}

function buildFileCandidateKeys(fileContext) {
  const keys = [{ key: fileContext.normalizedStem, boost: 40 }]
  const normalizedPath = normalize(fileContext.filePath.replace(/\\/g, ' '))
  const overrideKey = NAME_OVERRIDES[fileContext.normalizedStem]

  if (overrideKey) {
    keys.push({ key: normalize(overrideKey), boost: 30 })
  }

  if (normalizedPath.includes(' milkshake ')) {
    keys.push({ key: `${fileContext.normalizedStem} milkshake`.trim(), boost: 100 })
    if (overrideKey) keys.push({ key: `${normalize(overrideKey)} milkshake`.trim(), boost: 90 })
  }

  if (normalizedPath.includes(' mojito ')) {
    keys.push({ key: `${fileContext.normalizedStem} mojito`.trim(), boost: 100 })
    if (overrideKey) keys.push({ key: `${normalize(overrideKey)} mojito`.trim(), boost: 90 })
  }

  if (normalizedPath.includes(' tea ')) {
    keys.push({ key: `${fileContext.normalizedStem} tea`.trim(), boost: 70 })
    if (overrideKey) keys.push({ key: `${normalize(overrideKey)} tea`.trim(), boost: 60 })
  }

  if (fileContext.normalizedStem === 'baklawa tea') {
    keys.push({ key: 'maazym baklawa tea', boost: 90 })
  }

  if (fileContext.normalizedStem === 'morocan tea' || fileContext.normalizedStem === 'moroccan tea') {
    keys.push({ key: 'moroccan mint tea', boost: 90 })
  }

  if (fileContext.normalizedStem === 'pina colada') {
    keys.push({ key: 'pi a colada', boost: 80 })
    keys.push({ key: 'pia colada', boost: 80 })
  }

  return keys.filter((item) => item.key)
}

function scoreFileQuality(filePath, product, matchScore) {
  const ext = path.extname(filePath).toLowerCase()
  const rawStem = path.basename(filePath, ext)
  const normalizedStem = normalize(rawStem)
  const normalizedName = normalize(product.name_en ?? '')
  let score = matchScore

  if (normalizedStem === normalizedName) score += 25
  if (rawStem === rawStem.trim()) score += 5
  if (!/[0-9]/.test(rawStem)) score += 3
  if (!/\.\./.test(rawStem)) score += 2
  if (ext === '.jpg' || ext === '.jpeg') score += 2
  if (ext === '.png') score += 1

  return score
}

function resolveDuplicateMatches(matched) {
  const selected = []
  const unresolved = []
  const resolved = []
  const grouped = new Map()

  for (const item of matched) {
    const values = grouped.get(item.product.id) ?? []
    values.push(item)
    grouped.set(item.product.id, values)
  }

  for (const [, items] of grouped) {
    if (items.length === 1) {
      selected.push(items[0])
      continue
    }

    const ranked = [...items]
      .map((item) => ({
        ...item,
        fileQualityScore: scoreFileQuality(item.filePath, item.product, item.score),
      }))
      .sort((left, right) => right.fileQualityScore - left.fileQualityScore)

    if (ranked[0].fileQualityScore > ranked[1].fileQualityScore) {
      selected.push(ranked[0])
      resolved.push(ranked)
      continue
    }

    unresolved.push(ranked)
  }

  return { selected, unresolved, resolved }
}

async function uploadAndLink(filePath, product) {
  const ext = path.extname(filePath).toLowerCase()
  const fileBuffer = await fs.readFile(filePath)
  const storagePath = `products/${product.id}${ext}`

  const { error: uploadError } = await withRetry(`upload ${storagePath}`, () =>
    supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: getMimeType(ext),
        upsert: true,
      })
  )

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  const { error: updateError } = await withRetry(`update product ${product.id}`, () =>
    supabase
      .from('products')
      .update({ image_url: data.publicUrl })
      .eq('id', product.id)
  )

  if (updateError) throw updateError

  return data.publicUrl
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Root folder: ${ROOT_DIR}`)
  console.log(`Bucket: ${BUCKET}`)

  await ensureBucket()

  const [products, categories] = await Promise.all([fetchProducts(), fetchCategories()])
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const enrichedProducts = products.map((product) => ({
    ...product,
    category_name_en: categoryById.get(product.category_id)?.name_en ?? null,
    category_name_ar: categoryById.get(product.category_id)?.name_ar ?? null,
  }))
  const productIndex = buildProductIndex(enrichedProducts)
  const allFiles = await walk(ROOT_DIR)
  const imageFiles = allFiles.filter((filePath) =>
    IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  )

  const matched = []
  const unmatched = []
  const ambiguous = []
  const skipped = []

  for (const filePath of imageFiles) {
    const result = resolveFileMatch(filePath, productIndex)

    if (result.type === 'matched') {
      matched.push({ filePath, normalizedStem: result.normalizedStem, product: result.product, score: result.score })
    } else if (result.type === 'unmatched') {
      unmatched.push({ filePath, normalizedStem: result.normalizedStem })
    } else if (result.type === 'ambiguous') {
      ambiguous.push({
        filePath,
        normalizedStem: result.normalizedStem,
        candidates: result.candidates,
      })
    } else {
      skipped.push({ filePath, reason: result.reason })
    }
  }

  const duplicateResolution = resolveDuplicateMatches(matched)
  const duplicateProductMatches = duplicateResolution.unresolved
  const resolvedDuplicateMatches = duplicateResolution.resolved
  const selectedMatches = duplicateResolution.selected

  console.log(`Products loaded: ${enrichedProducts.length}`)
  console.log(`Image files found: ${imageFiles.length}`)
  console.log(`Matched: ${matched.length}`)
  console.log(`Selected matches: ${selectedMatches.length}`)
  console.log(`Unmatched: ${unmatched.length}`)
  console.log(`Ambiguous: ${ambiguous.length}`)
  console.log(`Duplicate product matches: ${duplicateProductMatches.length}`)
  console.log(`Resolved duplicate groups: ${resolvedDuplicateMatches.length}`)
  console.log(`Skipped: ${skipped.length}`)

  if (skipped.length > 0) {
    console.log('\nSkipped files:')
    for (const item of skipped.slice(0, 20)) {
      console.log(`- ${item.filePath} (${item.reason})`)
    }
    if (skipped.length > 20) {
      console.log(`... and ${skipped.length - 20} more`)
    }
  }

  if (unmatched.length > 0) {
    console.log('\nUnmatched files:')
    for (const item of unmatched.slice(0, 50)) {
      console.log(`- ${item.normalizedStem} -> ${item.filePath}`)
    }
    if (unmatched.length > 50) {
      console.log(`... and ${unmatched.length - 50} more`)
    }
  }

  if (ambiguous.length > 0) {
    console.log('\nAmbiguous files:')
    for (const item of ambiguous.slice(0, 20)) {
      console.log(`- ${item.normalizedStem} -> ${item.filePath}`)
      for (const candidate of item.candidates) {
        console.log(`  * ${candidate.name_en} | ${candidate.name_ar} | ${candidate.id}`)
      }
    }
    if (ambiguous.length > 20) {
      console.log(`... and ${ambiguous.length - 20} more`)
    }
  }

  if (duplicateProductMatches.length > 0) {
    console.log('\nDuplicate product matches:')
    for (const items of duplicateProductMatches.slice(0, 20)) {
      console.log(`- ${items[0].product.name_en}`)
      for (const item of items) {
        console.log(`  * ${item.filePath}`)
      }
    }
    if (duplicateProductMatches.length > 20) {
      console.log(`... and ${duplicateProductMatches.length - 20} more`)
    }
  }

  if (resolvedDuplicateMatches.length > 0) {
    console.log('\nResolved duplicate groups:')
    for (const items of resolvedDuplicateMatches.slice(0, 20)) {
      console.log(`- ${items[0].product.name_en} -> ${items[0].filePath}`)
    }
    if (resolvedDuplicateMatches.length > 20) {
      console.log(`... and ${resolvedDuplicateMatches.length - 20} more`)
    }
  }

  if (!APPLY) {
    console.log('\nDry run finished. Review unmatched, ambiguous, and duplicate items, then run with --apply.')
    return
  }

  if (ambiguous.length > 0 || duplicateProductMatches.length > 0) {
    console.log('\nApply mode stopped because there are ambiguous or duplicate product matches.')
    console.log('Fix those conflicts first, then rerun.')
    process.exitCode = 1
    return
  }

  console.log('\nUploading and linking matched files...')

  let successCount = 0
  for (const item of selectedMatches) {
    try {
      const publicUrl = await uploadAndLink(item.filePath, item.product)
      successCount += 1
      console.log(`OK ${item.product.name_en} -> ${publicUrl}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`FAILED ${item.product.name_en} <- ${item.filePath}: ${message}`)
    }
  }

  console.log(`\nCompleted. Updated ${successCount} of ${selectedMatches.length} selected products.`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Fatal error: ${message}`)
  process.exit(1)
})
