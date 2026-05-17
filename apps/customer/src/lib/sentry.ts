import * as Sentry from '@sentry/react'
import { BrowserTracing } from '@sentry/tracing'
import type { TenantScope } from '@rms/platform'

const dsn = import.meta.env.VITE_SENTRY_DSN
const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development'
const release = import.meta.env.VITE_SENTRY_RELEASE || 'unknown'

export function initSentry() {
  if (!dsn) {
    return
  }

  Sentry.init({
    dsn,
    environment,
    release,
    integrations: [new BrowserTracing()],
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.level === 'info') return null
      return event
    },
  })
}

export function captureException(error: unknown, extra?: Record<string, unknown>) {
  if (!dsn) return
  Sentry.captureException(error, { extra })
}

export function syncSentryContext(input: {
  surface: 'customer' | 'admin'
  pathname: string
  tenantScope?: Partial<TenantScope>
  user?: {
    id?: string | null
    email?: string | null
    role?: string | null
  }
}) {
  if (!dsn) return

  Sentry.setTag('surface', input.surface)
  Sentry.setTag('route', input.pathname)
  Sentry.setTag('organization_id', input.tenantScope?.organizationId ?? 'global')
  Sentry.setTag('cluster_id', input.tenantScope?.clusterId ?? 'default-cluster')
  Sentry.setTag('property_id', input.tenantScope?.propertyId ?? 'default-property')

  if (input.user?.role) {
    Sentry.setTag('role', input.user.role)
  }

  if (input.user?.id || input.user?.email) {
    Sentry.setUser({
      id: input.user.id ?? undefined,
      email: input.user.email ?? undefined,
    })
  }
}
