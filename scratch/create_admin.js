const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Manually parse .env file
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

const envPath = path.join(__dirname, '../apps/admin/.env')
if (fs.existsSync(envPath)) {
  loadEnv(envPath)
} else {
  console.error('Error: .env file not found at', envPath)
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_ANON_KEY // User confirmed this is the service_role key

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

function generatePassword(length = 16) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+"
  let retVal = ""
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n))
  }
  return retVal
}

async function createAdmin() {
  const email = 'saidani_raed@hotmail.com'
  const password = generatePassword()
  
  console.log(`Checking if user ${email} already exists...`)

  // Check if user exists in auth
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('Error listing users:', listError.message)
    return
  }

  const existingUser = users.find(u => u.email === email)
  
  if (existingUser) {
    console.log(`User ${email} already exists in auth. Updating password...`)
    const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: password
    })
    if (updateError) {
      console.error('Error updating password:', updateError.message)
      return
    }
    
    // Ensure staff entry exists
    const { data: staffData } = await supabase.from('staff').select('id').eq('id', existingUser.id).single()
    if (!staffData) {
        console.log('Creating missing staff entry...')
        const { error: staffError } = await supabase.from('staff').insert([{
            id: existingUser.id,
            name: 'Saidani Raed',
            app_role: 'admin',
            is_active: true
        }])
        if (staffError) console.error('Error creating staff entry:', staffError.message)
    }

    console.log('Admin user updated.')
  } else {
    console.log(`Creating new admin user: ${email}`)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      console.error('Error creating auth user:', authError.message)
      return
    }

    const userId = authData.user.id
    console.log(`Auth user created with ID: ${userId}`)

    const { error: staffError } = await supabase
      .from('staff')
      .insert([
        {
          id: userId,
          name: 'Saidani Raed',
          app_role: 'admin',
          is_active: true
        }
      ])

    if (staffError) {
      console.error('Error creating staff entry:', staffError.message)
      return
    }

    console.log('Admin user successfully created.')
  }

  console.log('\n---------------------------------------------------------')
  console.log(`URL: ${supabaseUrl}`)
  console.log(`Username: ${email}`)
  console.log(`Password: ${password}`)
  console.log('---------------------------------------------------------')
}

createAdmin()
