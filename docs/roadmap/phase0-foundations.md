# Phase 0 Foundations

## Goal
Reduce dependency risk before larger roadmap items land by standardizing shared client/platform concerns.

## Implemented Now
- `packages/platform` provides:
  - `AppProviders`
  - `FeatureFlagProvider`
  - `TenantProvider`
  - `createAppQueryClient()`
- `packages/supabase` is now a formal workspace package with package exports for `client`, `realtime`, and `types`.
- Both web apps now bootstrap through `AppProviders` in:
  - `apps/customer/src/main.tsx`
  - `apps/admin/src/main.tsx`
- App-level Supabase clients now come from `@rms/supabase/client` instead of duplicated app-local construction.
- Customer checkout now uses `apps/customer/src/services/checkout.ts` instead of invoking `place-order` directly from the page.
- Tenant-aware feature flags now have database scaffolding in `supabase/migrations/20260512111330_platform_feature_flags.sql`.

## Backlog

### Service-Layer Standardization
- Move remaining direct Supabase calls out of pages and into `/services` modules.
- Prioritize:
  - `apps/customer/src/pages/MenuPage.tsx`
  - `apps/customer/src/pages/CheckoutPage.tsx`
  - `apps/admin/src/App.tsx`
  - `apps/admin/src/pages/OrdersPage.tsx`
  - `apps/admin/src/pages/SettingsPage.tsx`
- Create one service per domain area: `payments`, `search`, `tracking`, `notifications`, `staff`, `analytics`.

### React Query Adoption
- Convert read-heavy hooks and pages to query hooks first.
- Recommended first wave:
  - menu/catalog
  - search results
  - restaurant settings
  - operator notifications
  - staff profile/session bootstrap
- Keep mutations behind service methods and invalidate by tenant-aware query keys.

### Feature Flags
- Use the `feature_flags` table as the future source of truth for staged rollout.
- Keep env flags as the bootstrap mechanism until a read path is added.
- First flags to operationalize:
  - `stripePayments`
  - `advancedSearch`
  - `orderScheduling`
  - `realtimeDriverTracking`
  - `driverChat`
  - `campaignBuilder`
  - `multiLocation`

### Tenant Context
- Current provider supports env/bootstrap scope only.
- Next work:
  - derive tenant scope from auth/session or route context
  - flow tenant scope through service calls
  - apply tenant scope in all new schema and edge-function writes
  - audit singleton assumptions in restaurant settings and analytics queries

## Exit Criteria
- Shared platform package is the only entry point for app providers.
- Shared Supabase package is the default browser client path.
- New modules do not query Supabase directly from pages.
- Feature rollout can be controlled without code changes.
- Tenant scope is available to routing, services, and observability.
