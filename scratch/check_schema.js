const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      process.env[key] = value
    }
  })
}

loadEnv(path.join(__dirname, '../apps/admin/.env'))

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkSchema() {
  console.log('Checking table ai_suggestion_cache...')
  const { data, error } = await supabase
    .from('ai_suggestion_cache')
    .select('suggestion_payload')
    .eq('cache_key', 'global_menu_rank')
    .gt('expires_at', new Date().toISOString())

  if (error) {
    console.error('Error querying ai_suggestion_cache:', error.message)
    console.error('Error details:', error)
  } else {
    console.log('Successfully queried ai_suggestion_cache. Data:', data)
  }
  
  console.log('\nChecking all tables...')
  const { data: tables, error: tablesError } = await supabase
    .rpc('get_tables_info') // Might not exist
    
  if (tablesError) {
      // Fallback: query pg_catalog if we have permissions (service_role should)
      const { data: pgData, error: pgError } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public')
        
      if (pgError) {
          console.error('Error listing tables from pg_tables:', pgError.message)
      } else {
          console.log('Tables in public schema:', pgData.map(t => t.tablename).join(', '))
      }
  } else {
      console.log('Tables:', tables)
  }
}

checkSchema()
