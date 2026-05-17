# Supabase Project Clone Checklist

This checklist is the companion to:

- `supabase/recreate_database_no_sample_data.sql`

Use that SQL file to recreate the database schema, relationships, functions, triggers, RLS, storage bucket SQL, and baseline config/default rows on a fresh Supabase project.

Use this checklist for everything that SQL alone does **not** recreate.

## 1. Create the new Supabase project

1. Create a new Supabase project for the new restaurant.
1. Copy the new project values from Supabase Dashboard -> Project Settings -> API:
   - project URL
   - anon/publishable key
   - service role key

## 2. Apply the combined SQL bundle

Run:

- `supabase/recreate_database_no_sample_data.sql`

This bundle excludes only:

- `supabase/migrations/002_seed_data.sql`
- `supabase/migrations/012_add_sample_promotion_products.sql`
- `supabase/migrations/025_maazym_menu_catalog.sql`

So the new project gets the full platform feature set without demo/sample restaurant catalog content.

## 3. Configure app environment variables

Update the new restaurant’s app/runtime environment values using:

- `NETLIFY_CUSTOMER.env.example`
- `NETLIFY_ADMIN.env.example`
- `apps/customer/.env.example`
- `apps/admin/.env.example`

At minimum, replace:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL`
- `VITE_CUSTOMER_ORIGIN`

If you use Netlify Edge Functions for the customer site, also set private runtime values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 4. Deploy Supabase Edge Functions

The database is not enough by itself. This project depends on Edge Functions under `supabase/functions`.

Deploy the functions used by the apps and integrations:

- `advance-order-status`
- `assign-driver`
- `auth-hook`
- `claim-order-email`
- `compute-ai-suggestions`
- `driver-order-action`
- `driver-order-inbox`
- `invalidate-cache`
- `manage-drivers`
- `manage-order-availability`
- `manage-operator-notifications`
- `manage-payment-gateway-settings`
- `manage-staff`
- `mark-payment-collected`
- `marketing-unsubscribe`
- `operator-notification-dispatch`
- `place-order`
- `promotion-eligibility`
- `qpay-webhook`
- `send-notification`
- `stripe-webhook`
- `update-customer-profile`

At minimum, the platform directly depends on:

- `place-order`
- `advance-order-status`
- `manage-order-availability`
- `manage-operator-notifications`
- `manage-payment-gateway-settings`
- `auth-hook`
- `update-customer-profile`

## 5. Set Edge Function secrets

Copy secrets from:

- `SUPABASE_PRODUCTION_SECRETS.env.example`
- `supabase/functions/.env.example`

Core secrets/config:

- `CUSTOMER_APP_URL`
- `OPERATOR_SECRETS_MASTER_KEY`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

Optional integration secrets, only if the restaurant uses them:

- `QPAY_API_BASE_URL`
- `QPAY_MERCHANT_ID`
- `QPAY_API_KEY`
- `QPAY_SECRET_KEY`
- `QPAY_WEBHOOK_SECRET`
- `QPAY_WEBHOOK_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Set these in:

- Supabase Dashboard -> Edge Functions -> Secrets

## 6. Configure Auth settings

Mirror the hosted Auth settings described in:

- `supabase/config.toml`
- `DEPLOYMENT_NETLIFY_SUPABASE.md`

Configure in Supabase Dashboard -> Authentication:

1. Site URL
1. Additional Redirect URLs
1. Magic link email template behavior using `{{ .RedirectTo }}`
1. SMTP provider for production email login
1. Phone auth provider, if the restaurant uses OTP/SMS login
1. Twilio auth provider settings, if phone auth is enabled

## 7. Connect the Custom Access Token Hook

This repo includes:

- `supabase/functions/auth-hook/index.ts`

It must be connected manually in:

- Supabase Dashboard -> Authentication -> Hooks -> Custom Access Token Hook

Set the hook URL to the newly deployed function for the new project.

This is required if you want staff role claims to flow the same way as the current project.

## 8. Configure provider webhooks

If payments are enabled for the new restaurant, point the providers to the new project:

- Stripe webhook -> `https://<new-project-ref>.functions.supabase.co/stripe-webhook`
- QPay webhook -> `https://<new-project-ref>.functions.supabase.co/qpay-webhook`

Also make sure:

- `CUSTOMER_APP_URL` points to the new restaurant’s live customer site

because payment redirects and return URLs depend on it.

## 9. Configure database/project settings expected by triggers

The delivered-order trigger in:

- `supabase/migrations/003_functions.sql`
- `supabase/migrations/20260512130000_fix_customer_profile_trigger_pg_net.sql`

expects these settings to exist:

- `app.supabase_url`
- `app.service_role_key`

Verify what the project sees:

```sql
select current_setting('app.supabase_url', true);
select current_setting('app.service_role_key', true);
```

If they are missing, the `update-customer-profile` trigger path will not be fully wired for the new project.

## 10. Review SQL-created operational features

The combined SQL already creates these, but you should verify them on the new project:

- `pg_cron` schedules
- `pg_net` usage for the delivered-order trigger
- realtime publication changes
- storage buckets and storage policies
- RLS policies across public tables

Good post-bootstrap checks:

1. Confirm storage buckets exist.
1. Confirm cron jobs appear.
1. Confirm realtime-backed tables are present in publication where expected.
1. Confirm RLS is enabled on the critical tables.

## 11. Create the first admin user

After Auth is ready, create or invite the first operator account, then insert its `staff` row.

Example pattern from `README.md`:

```sql
INSERT INTO staff (id, name, app_role)
SELECT id, 'Admin User', 'admin'
FROM auth.users
WHERE email = 'admin@yourdomain.com';
```

Adjust the email/name/role for the new restaurant.

## 12. Load the new restaurant’s actual business data

The SQL bundle intentionally does **not** include demo/sample restaurant content.

You still need to populate:

- categories
- products
- modifier groups/options
- promotion mappings
- combo promotions/items
- restaurant branding/settings
- staff records
- payment/operator settings
- order availability settings

Do this either through:

- admin UI
- targeted SQL imports
- bespoke seed/import scripts for the new restaurant

## 13. Smoke-test the cloned project

Before go-live, verify at least:

1. Customer login or OTP flow
1. Admin login and staff role claim behavior
1. Menu/catalog loading
1. Cart and checkout
1. `place-order`
1. Order status advancement
1. Order availability toggle/schedule behavior
1. Payment flow, if enabled
1. Notification flow, if enabled
1. Delivered-order customer profile sync

## 14. Recommended artifact set for each new restaurant

For each additional restaurant, keep these four things together:

1. `supabase/recreate_database_no_sample_data.sql`
1. This checklist
1. The new restaurant’s environment/secret values
1. The new restaurant’s own menu/catalog import or seed source
