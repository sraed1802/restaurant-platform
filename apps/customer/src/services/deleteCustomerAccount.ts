import { supabase } from '../lib/supabase'

export async function deleteCustomerAccount(): Promise<{ error: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return { error: 'You must be signed in to delete your account.' }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  if (!supabaseUrl?.trim()) {
    return { error: 'App is not configured for account deletion.' }
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/delete-customer-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  let payload: { success?: boolean; error?: string } = {}
  try {
    payload = (await response.json()) as { success?: boolean; error?: string }
  } catch {
    return { error: 'Unexpected response from server.' }
  }

  if (!response.ok || !payload.success) {
    return { error: payload.error ?? 'Could not delete your account. Please try again or contact us.' }
  }

  return { error: null }
}
