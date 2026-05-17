// apps/customer/src/lib/supabase.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@rms/supabase/client'

/**
 * Workspace `Database` typings lag some tables/embeds; loosen only for the customer PWA
 * so queries compile while the shared schema catches up.
 */
export const supabase = createSupabaseBrowserClient({
  auth: {
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
}) as unknown as SupabaseClient
