import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from './queryClient'
import { FeatureFlagProvider } from './featureFlags'
import { TenantProvider } from './tenant'
import type { AppFeatureFlags, TenantScope } from './types'

export function AppProviders({
  children,
  featureFlags,
  initialTenantScope,
}: {
  children: ReactNode
  featureFlags?: Partial<AppFeatureFlags>
  initialTenantScope?: Partial<TenantScope>
}) {
  const [queryClient] = useState(() => createAppQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <FeatureFlagProvider overrides={featureFlags}>
        <TenantProvider initialScope={initialTenantScope}>
          {children}
        </TenantProvider>
      </FeatureFlagProvider>
    </QueryClientProvider>
  )
}
