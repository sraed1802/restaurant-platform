# Phase 1 Search And Sentry

## Search Workstreams

### Backend
- Existing full-text search base remains in:
  - `supabase/migrations/029_add_product_search_vector.sql`
  - `apps/customer/src/services/searchProducts.ts`
- Next backend tasks:
  - add structured filter support for price, prep time, tags, and future cuisine/rating dimensions
  - add search telemetry through a safe server-side analytics path
  - add index review whenever new sort/filter columns land

### UI
- Current menu flow already supports local filtering and sorting in `apps/customer/src/pages/MenuPage.tsx`.
- Implemented now:
  - advanced server-backed search can be turned on or off via the `advancedSearch` feature flag
- Next UI tasks:
  - move search request state to React Query
  - unify search and browse result ordering so category browsing and search use the same product scope
  - expose richer sort labels and empty/error states

## Sentry Workstreams

### Implemented Now
- App-level route and tenant context sync was added in:
  - `apps/customer/src/App.tsx`
  - `apps/admin/src/App.tsx`
- Shared Sentry context helpers were added in:
  - `apps/customer/src/lib/sentry.ts`
  - `apps/admin/src/lib/sentry.ts`

### Next Observability Tasks
- Add checkout-specific breadcrumbs and payment provider tags.
- Capture search query failures with normalized query metadata.
- Add backend observability wrapper for critical edge functions:
  - `place-order`
  - `stripe-webhook`
  - `operator-notification-dispatch`
  - scheduling/chat functions once added
- Define alert thresholds for:
  - payment initialization failure rate
  - webhook processing failures
  - auth callback failures
  - p95 latency regressions in checkout and tracking

## Recommended Sequence
1. Move menu/search reads to React Query hooks.
2. Add search telemetry on the backend side.
3. Expand frontend Sentry scope/breadcrumbs around checkout and auth.
4. Add backend error forwarding for Edge Functions once DSNs and release metadata are available.
