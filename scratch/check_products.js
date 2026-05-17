import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../apps/admin/.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name_en, image_url')
    
  if (error) {
    console.error('Error fetching products:', error.message)
    return
  }
  
  console.log('Products:')
  data.forEach(p => {
    console.log(`- ${p.name_en}: ${p.image_url || 'null'}`)
  })
}

checkProducts()
