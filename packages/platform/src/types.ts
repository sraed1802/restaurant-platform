export interface TenantScope {
  organizationId: string | null
  clusterId: string | null
  propertyId: string | null
}

export interface AppFeatureFlags {
  stripePayments: boolean
  hotelRoomDelivery: boolean
  advancedSearch: boolean
  sentryTracing: boolean
  orderScheduling: boolean
  realtimeDriverTracking: boolean
  driverChat: boolean
  pushNotifications: boolean
  campaignBuilder: boolean
  analyticsDashboards: boolean
  oauthLogin: boolean
  gdprTooling: boolean
  multiLocation: boolean
}
