import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CustomerIdRow {
  id: string
}

export async function hasCustomerPlacedOrder(
  supabase: SupabaseClient,
  args: {
    authUserId?: string | null
    phoneE164?: string | null
  }
): Promise<boolean> {
  const customerIds = new Set<string>()

  if (args.authUserId) {
    customerIds.add(args.authUserId)
  }

  if (args.phoneE164) {
    const { data: phoneCustomers, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('phone_e164', args.phoneE164)

    if (customerError) {
      throw customerError
    }

    for (const customer of (phoneCustomers ?? []) as CustomerIdRow[]) {
      customerIds.add(customer.id)
    }
  }

  if (customerIds.size === 0) {
    return false
  }

  const { count, error: orderCountError } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('customer_id', [...customerIds])
    .neq('status', 'cancelled')

  if (orderCountError) {
    throw orderCountError
  }

  return (count ?? 0) > 0
}
