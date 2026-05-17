# RMS Platform
## Restaurant Management & Ordering System — Qatar

A production-grade, event-driven food ordering and delivery orchestration platform built on **Netlify + Supabase**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  NETLIFY EDGE                                                    │
│  ┌──────────────────────┐   ┌──────────────────────────────┐   │
│  │  Customer App         │   │  Admin OPS Center            │   │
│  │  order.restaurant.qa  │   │  ops.restaurant.qa           │   │
│  │  /api/menu  (cached)  │   │  Auth-gated, role-enforced   │   │
│  │  /api/promotions      │   │  Dashboard · Orders ·        │   │
│  │  /api/suggestions     │   │  Drivers · Menu · Analytics  │   │
│  └──────────┬───────────┘   └──────────────┬───────────────┘   │
└─────────────┼─────────────────────────────┼─────────────────────┘
              │                             │
              ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                        │
│                                                                  │
│  Auth (OTP + JWT role claims)                                   │
│                                                                  │
│  Edge Functions:                                                 │
│  place-order · advance-order-status · assign-driver             │
│  compute-ai-suggestions · send-notification                     │
│  update-customer-profile · invalidate-cache · auth-hook        │
│                                                                  │
│  PostgreSQL:                                                     │
│  Catalog · Orders · Events · Analytics · AI Cache               │
│  Materialized Views · pg_cron · pg_net · RLS                   │
│                                                                  │
│  Realtime: admin:orders · admin:drivers · order:{id}            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
rms/
├── apps/
│   ├── customer/          # Public ordering app (Vite + React)
│   └── admin/             # OPS center dashboard (Vite + React)
├── packages/
│   └── supabase/          # Shared types + realtime utilities
├── supabase/
│   ├── migrations/        # Schema, seed data, functions
│   ├── functions/         # Edge functions (Deno)
│   └── config.toml
└── netlify/
    ├── edge-functions/    # SWR cache layer (menu, promos, AI)
    └── netlify.customer.toml
```

---

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm i -g netlify-cli`)
- A Supabase project (free tier works for development)
- A Netlify account

---

## Local Development Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd rms
npm install
```

### 2. Configure Supabase

```bash
# Start local Supabase (Docker required)
supabase start

# Apply migrations in order
supabase db push

# Or manually:
psql $DATABASE_URL -f supabase/migrations/001_initial_schema.sql
psql $DATABASE_URL -f supabase/migrations/002_seed_data.sql
psql $DATABASE_URL -f supabase/migrations/003_functions.sql
```

### 3. Configure environment variables

```bash
# Customer app
cp apps/customer/.env.example apps/customer/.env.local
# Edit: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Admin app
cp apps/admin/.env.example apps/admin/.env.local
# Edit: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Get your values from: Supabase Dashboard → Project Settings → API

### 4. Create your first admin user

In the Supabase Dashboard → SQL Editor:

```sql
-- 1. Create the user in Auth (or use the dashboard)
-- Then insert their staff record:
INSERT INTO staff (id, name, app_role)
SELECT id, 'Admin User', 'admin'
FROM auth.users
WHERE email = 'admin@yourdomain.com';
```

### 5. Start development servers

```bash
# Terminal 1: Customer app
cd apps/customer && npm run dev
# → http://localhost:5173

# Terminal 2: Admin app
cd apps/admin && npm run dev
# → http://localhost:5174
```

### 6. Deploy edge functions locally

```bash
supabase functions serve --env-file supabase/functions/.env.local
```

---

## Production Deployment

### Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run all three migration files in the SQL Editor (in order)
3. Enable Phone Auth: Authentication → Providers → Phone → Enable
4. Configure Twilio: Authentication → Providers → Phone → Twilio
5. Set edge function secrets:
   ```bash
   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
   supabase secrets set TWILIO_AUTH_TOKEN=xxxx
   supabase secrets set TWILIO_FROM_NUMBER=+1234567890
   ```
6. Deploy edge functions:
   ```bash
   supabase functions deploy place-order
   supabase functions deploy advance-order-status
   supabase functions deploy assign-driver
   supabase functions deploy compute-ai-suggestions
   supabase functions deploy send-notification
   supabase functions deploy update-customer-profile
   supabase functions deploy invalidate-cache
   supabase functions deploy auth-hook
   ```
7. Configure Auth Hook: Dashboard → Auth → Hooks → Custom Access Token → set to your `auth-hook` function URL

### Netlify — Customer App

```bash
cd apps/customer
netlify init
netlify env:set VITE_SUPABASE_URL https://your-project.supabase.co
netlify env:set VITE_SUPABASE_ANON_KEY your-anon-key
netlify deploy --prod
```

Copy `netlify/netlify.customer.toml` to `apps/customer/netlify.toml` before deploying.

### Netlify — Admin App

Deploy as a **separate Netlify site**:

```bash
cd apps/admin
netlify init   # choose a new site
netlify env:set VITE_SUPABASE_URL https://your-project.supabase.co
netlify env:set VITE_SUPABASE_ANON_KEY your-anon-key
netlify deploy --prod
```

Optionally enable Netlify Access Control (IP allowlisting) for the admin site.

---

## Feature Reference

### Order Lifecycle

```
pending → confirmed → preparing → ready → dispatched → delivered
  ↓           ↓
cancelled  cancelled   (manager/admin only beyond confirmed)
```

All transitions are enforced at three layers:
1. Postgres CHECK constraint (rejects invalid states at DB level)
2. Edge function guard (validates transition + writes immutable event)
3. UI (disables illegal action buttons)

### AI Suggestion System

- Runs every 15 minutes via `pg_cron`
- Reads `mv_product_popularity` + `mv_peak_demand` + scoring weights from `system_config`
- Writes ranked results to `ai_suggestion_cache`
- Scoring weights adjustable in admin: `system_config.ai_scoring_weights`
- Cache served via Netlify edge with 15-min TTL + SWR

### Notification System

- Bilingual (Arabic/English) based on `orders.language_pref`
- Templates editable in `notification_templates` table (no deploy needed)
- Provider: Twilio SMS (swap by updating `send-notification` edge function)
- Fires on: order.created, order.confirmed, order.ready, order.dispatched, order.delivered, order.cancelled

### Promotions

- **Code-based**: Customer enters code at checkout
- **Automatic**: Applied based on cart conditions (handled in `place-order`)
- **AI Suggested**: Ranked and surfaced by AI layer
- AI rank score (0–1) configurable per promotion in admin

### Analytics

All events flow to `analytics_events`. Aggregated into materialized views:
- `mv_hourly_revenue` — refreshed every 30 min
- `mv_product_popularity` — refreshed every hour
- `mv_peak_demand` — refreshed daily at 3am
- `mv_promo_performance` — refreshed every 15 min

Dashboard queries only materialized views, never raw event tables.

---

## Security Model

| Role       | Capabilities                                          |
|------------|-------------------------------------------------------|
| anon       | Read public catalog, AI cache, promotions             |
| authenticated (customer) | Read own orders, own profile        |
| supervisor | Advance orders, assign drivers                        |
| manager    | All supervisor + cancel orders, manage promotions     |
| admin      | All manager + manage staff, menu, AI weights          |
| service_role | Full access (edge functions only, never in client) |

RLS is enabled on every table. The service_role key is **never** exposed to any frontend.

---

## Key Configuration

All runtime config lives in `system_config` table — editable without redeployment:

| Key                      | Default   | Description                      |
|--------------------------|-----------|----------------------------------|
| `delivery_fee`           | `5.000`   | Fixed delivery fee (QAR)         |
| `ai_scoring_weights`     | see below | AI ranking formula weights       |
| `order_sla_minutes`      | `45`      | Target delivery SLA              |
| `suggestion_cache_ttl_minutes` | `15` | AI cache TTL in minutes         |
| `operating_hours`        | 10–23     | Restaurant open/close times      |
| `guest_checkout_enabled` | `true`    | Allow orders without account     |

Default AI weights:
```json
{
  "popularity": 0.35,
  "revenue": 0.25,
  "affinity": 0.20,
  "promo_conversion": 0.15,
  "recency": 0.05
}
```

---

## Development Notes

- **Never use `service_role` key in any frontend** — all privileged operations go through edge functions
- **Order events are immutable** — `no_update` and `no_delete` rules enforced at DB level
- **Idempotency keys** prevent duplicate events from network retries
- **Realtime subscriptions** are singleton-managed via `getOrCreateChannel()` to prevent memory leaks
- **Analytics tracking** fails silently — never blocks user-facing operations
- **AI suggestions** are always client-readable; ranking adjustments are client-side only (no PII sent to AI layer)

---

## Extending the System

### Add a new notification trigger
1. Insert a row in `notification_templates` with the new `event_type`
2. Call `send-notification` from the relevant edge function with that event type

### Add a new edge function
1. Create `supabase/functions/your-function/index.ts`
2. Deploy: `supabase functions deploy your-function`
3. Always verify JWT + role claim before any privileged operation

### Add a new analytics event
1. Call `trackEvent()` from the frontend analytics SDK with your new `event_type`
2. Add a filter for it in the relevant materialized view if you need aggregation

### Change AI scoring weights
Update via Supabase Dashboard → Table Editor → `system_config` → `ai_scoring_weights`
Changes take effect on the next 15-minute compute cycle.
