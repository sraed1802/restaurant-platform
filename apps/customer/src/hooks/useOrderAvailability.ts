import { useQuery } from '@tanstack/react-query'
import { useTenantScope } from '@rms/platform'
import {
  DEFAULT_ORDER_AVAILABILITY_STATUS,
  getPublicOrderAvailability,
  type OrderAvailabilityStatus,
} from '../services/orderAvailability'

export function useOrderAvailability() {
  const tenantScope = useTenantScope()

  const query = useQuery({
    queryKey: ['order_availability', tenantScope.scopeKey],
    queryFn: async (): Promise<OrderAvailabilityStatus> => {
      const response = await getPublicOrderAvailability(tenantScope)
      return response.status
    },
    staleTime: 45_000,
    gcTime: 10 * 60_000,
  })

  return {
    status: query.data ?? DEFAULT_ORDER_AVAILABILITY_STATUS,
    loading: query.isPending,
    isOrderable: (query.data ?? DEFAULT_ORDER_AVAILABILITY_STATUS).is_open_now,
  }
}
