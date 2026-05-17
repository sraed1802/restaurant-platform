// packages/supabase/client.ts
import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

if (typeof supabaseUrl === 'string') {
  const u = supabaseUrl.toLowerCase()
  if (u.includes('trycloudflare.com')) {
    throw new Error(
      'VITE_SUPABASE_URL must be your Supabase project URL (e.g. https://<ref>.supabase.co), not a Cloudflare quick tunnel to the frontend. See apps/admin/.env.example.'
    )
  }
  if (!u.includes('.supabase.co') && !u.includes('127.0.0.1') && !u.includes('localhost')) {
    console.warn(
      '[supabase] VITE_SUPABASE_URL does not look like *.supabase.co or local Supabase — auth and REST calls may fail.'
    )
  }
}

type BrowserClientOptions = Pick<SupabaseClientOptions<'public'>, 'auth' | 'realtime' | 'global'>

const baseOptions: BrowserClientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
}

export function createSupabaseBrowserClient(
  options: BrowserClientOptions = {}
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    ...baseOptions,
    ...options,
    auth: {
      ...baseOptions.auth,
      ...options.auth,
    },
    realtime: {
      ...baseOptions.realtime,
      ...options.realtime,
    },
  })
}

export type { Database }
