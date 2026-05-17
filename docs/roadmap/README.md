# Roadmap Implementation Artifacts

This directory turns the staged roadmap into concrete implementation tracks that can be worked sprint by sprint without editing the original plan file.

## Files
- `phase0-foundations.md`: service-layer, React Query, feature-flag, and tenant-context backlog tied to the new shared platform code.
- `phase1-stripe.md`: schema, edge-function, checkout, webhook, and admin-reporting milestones for Stripe.
- `phase1-search-sentry.md`: backend, UI, and observability workstreams for advanced search and Sentry hardening.
- `phase2-surfaces.md`: proposed module boundaries and product surfaces for drivers, chat, scheduling, fleet, and staff workflows.
- `phase3-platform-sequencing.md`: dependency order for OAuth, GDPR, multi-location, and analytics.

## Implemented Foundations
- Shared platform providers were added in `packages/platform`.
- Shared Supabase package boundaries were formalized in `packages/supabase`.
- Customer and admin app bootstraps now use the shared app providers.
- Customer checkout now goes through a service layer before invoking backend order creation.
- Stripe-ready payment storage and webhook scaffolding were added under `supabase/migrations` and `supabase/functions`.
