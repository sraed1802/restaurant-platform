import { supabase } from '../lib/supabase'

export async function publishDriverLocation(input: {
  lat: number
  lng: number
  accuracy_m?: number
  heading?: number
}): Promise<void> {
  const { error } = await supabase.functions.invoke('driver-update-location', {
    body: input,
  })
  if (error) throw error
}
