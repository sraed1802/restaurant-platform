import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TenantScope } from './types'

const defaultTenantScope: TenantScope = {
  organizationId: import.meta.env.VITE_ORGANIZATION_ID ?? null,
  clusterId: import.meta.env.VITE_CLUSTER_ID ?? null,
  propertyId: import.meta.env.VITE_PROPERTY_ID ?? null,
}

interface TenantContextValue extends TenantScope {
  hasTenantContext: boolean
  scopeKey: string
  setTenantScope: (nextScope: TenantScope) => void
}

const TenantContext = createContext<TenantContextValue>({
  ...defaultTenantScope,
  hasTenantContext: false,
  scopeKey: 'global',
  setTenantScope: () => undefined,
})

function buildScopeKey(scope: TenantScope): string {
  return [
    scope.organizationId ?? 'global',
    scope.clusterId ?? 'default-cluster',
    scope.propertyId ?? 'default-property',
  ].join(':')
}

export function TenantProvider({
  children,
  initialScope,
}: {
  children: ReactNode
  initialScope?: Partial<TenantScope>
}) {
  const [scope, setScope] = useState<TenantScope>({
    ...defaultTenantScope,
    ...initialScope,
  })

  const value = useMemo<TenantContextValue>(() => ({
    ...scope,
    hasTenantContext: Boolean(scope.organizationId || scope.clusterId || scope.propertyId),
    scopeKey: buildScopeKey(scope),
    setTenantScope: setScope,
  }), [scope])

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenantScope(): TenantContextValue {
  return useContext(TenantContext)
}
