# Phase 1 Stripe Integration

## Current Foundation
- Payment schema was extended in `supabase/migrations/20260512111331_stripe_payment_foundations.sql`.
- Stripe checkout helper was added in `supabase/functions/_shared/integrations/stripe.ts`.
- Stripe webhook handler was added in `supabase/functions/stripe-webhook/index.ts`.
- `place-order` now supports the new `online` payment path and stores Stripe identifiers in `payments`.
- Checkout exposes an `online` payment option behind the `stripePayments` feature flag.

## Delivery Tracks

### 1. Schema
- Done:
  - add idempotency key storage
  - allow multiple payment attempts per order
  - store checkout session and payment intent identifiers
  - add `payment_webhook_events` for inbound event traceability
- Next:
  - backfill tenant scope on new payment rows once core tables are tenant-aware
  - add reconciliation/admin reporting views

### 2. Edge Functions
- Done:
  - shared Stripe client helper
  - webhook verification
  - status mapping into `payments`, `orders`, `order_events`, and `audit_logs`
- Next:
  - move provider branching out of `place-order` into a dedicated payment orchestrator
  - add retry-safe payment initialization for repeat attempts
  - add webhook replay protection metrics

### 3. Checkout UI
- Done:
  - page-level service wrapper for place-order
  - gated `online` payment method in `apps/customer/src/pages/CheckoutPage.tsx`
- Next:
  - replace basic option buttons with explicit provider copy and status states
  - add cancelled/returned-session handling in checkout and tracking
  - show pending payment status in order tracking

### 4. Reporting
- Next:
  - add payment-provider filters in admin analytics
  - add failed-payment and refund counts
  - surface webhook processing failures from `payment_webhook_events`

## Required Environment Variables
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CUSTOMER_APP_URL`

## Notes
- The local Supabase CLI `migration new` command hung on this machine, so the migration file was created manually after multiple CLI attempts. The SQL file follows the standard timestamped migration naming pattern and should be reviewed alongside future generated migrations.
