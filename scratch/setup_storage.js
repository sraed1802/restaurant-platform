import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../apps/admin/.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_ANON_KEY // User said it's service_role

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupStorage() {
  const { data, error } = await supabase.storage.createBucket('menu', {
    public: true,
    fileSizeLimit: 1024 * 1024 * 2, // 2MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
  })
  
  if (error) {
    if (error.message.includes('already exists')) {
      console.log('Bucket "menu" already exists.')
    } else {
      console.error('Error creating bucket:', error.message)
    }
  } else {
    console.log('Bucket "menu" created successfully.')
  }
}

setupStorage()
