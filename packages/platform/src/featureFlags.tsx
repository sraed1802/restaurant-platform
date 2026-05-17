import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AppFeatureFlags } from './types'

const DEFAULT_FLAGS: AppFeatureFlags = {
  stripePayments: false,
  hotelRoomDelivery: true,
  advancedSearch: true,
  sentryTracing: true,
  orderScheduling: false,
  realtimeDriverTracking: false,
  driverChat: false,
  pushNotifications: false,
  campaignBuilder: false,
  analyticsDashboards: true,
  oauthLogin: false,
  gdprTooling: false,
  multiLocation: false,
}

const ENV_FLAG_KEYS: Record<keyof AppFeatureFlags, string> = {
  stripePayments: 'VITE_FF_STRIPE_PAYMENTS',
  hotelRoomDelivery: 'VITE_FF_HOTEL_ROOM_DELIVERY',
  advancedSearch: 'VITE_FF_ADVANCED_SEARCH',
  sentryTracing: 'VITE_FF_SENTRY_TRACING',
  orderScheduling: 'VITE_FF_ORDER_SCHEDULING',
  realtimeDriverTracking: 'VITE_FF_REALTIME_DRIVER_TRACKING',
  driverChat: 'VITE_FF_DRIVER_CHAT',
  pushNotifications: 'VITE_FF_PUSH_NOTIFICATIONS',
  campaignBuilder: 'VITE_FF_CAMPAIGN_BUILDER',
  analyticsDashboards: 'VITE_FF_ANALYTICS_DASHBOARDS',
  oauthLogin: 'VITE_FF_OAUTH_LOGIN',
  gdprTooling: 'VITE_FF_GDPR_TOOLING',
  multiLocation: 'VITE_FF_MULTI_LOCATION',
}

const FeatureFlagContext = createContext<AppFeatureFlags>(DEFAULT_FLAGS)

function parseBooleanEnv(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue == null || rawValue === '') {
    return fallback
  }

  const normalized = rawValue.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export function resolveFeatureFlags(overrides: Partial<AppFeatureFlags> = {}): AppFeatureFlags {
  const fromEnv = (flag: keyof AppFeatureFlags) =>
    parseBooleanEnv(import.meta.env[ENV_FLAG_KEYS[flag]], DEFAULT_FLAGS[flag])

  return {
    stripePayments: fromEnv('stripePayments'),
    hotelRoomDelivery: fromEnv('hotelRoomDelivery'),
    advancedSearch: fromEnv('advancedSearch'),
    sentryTracing: fromEnv('sentryTracing'),
    orderScheduling: fromEnv('orderScheduling'),
    realtimeDriverTracking: fromEnv('realtimeDriverTracking'),
    driverChat: fromEnv('driverChat'),
    pushNotifications: fromEnv('pushNotifications'),
    campaignBuilder: fromEnv('campaignBuilder'),
    analyticsDashboards: fromEnv('analyticsDashboards'),
    oauthLogin: fromEnv('oauthLogin'),
    gdprTooling: fromEnv('gdprTooling'),
    multiLocation: fromEnv('multiLocation'),
    ...overrides,
  }
}

export function FeatureFlagProvider({
  children,
  overrides,
}: {
  children: ReactNode
  overrides?: Partial<AppFeatureFlags>
}) {
  const value = useMemo(() => resolveFeatureFlags(overrides), [overrides])
  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>
}

export function useFeatureFlags(): AppFeatureFlags {
  return useContext(FeatureFlagContext)
}

export function useFeatureFlag(flag: keyof AppFeatureFlags): boolean {
  const flags = useFeatureFlags()
  return flags[flag]
}

export { DEFAULT_FLAGS as defaultFeatureFlags }
