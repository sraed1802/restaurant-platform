# Netlify + Supabase Production Deployment

This repository deploys as **three** Vite SPAs on Netlify plus Supabase services:

- `apps/customer` -> public ordering site on Netlify
- `apps/admin` -> operator/admin site on Netlify
- `apps/driver` -> driver delivery portal on Netlify
- `supabase/*` -> database, auth, storage, realtime, and Edge Functions on Supabase

It is not a Next.js App Router project today, so production deployment should follow the current Vite + Supabase structure unless you plan a separate framework migration.

## 1. Netlify Sites

Create **three** separate Netlify sites from the same Git repository. In each site’s UI, set **Base directory** to the app folder below; Netlify will read that app’s `netlify.toml`.

All three builds install dependencies from the **repository root** (`npm ci`) so workspace packages (`@rms/platform`, `@rms/supabase`) resolve correctly.

| Site | Base directory | Publish | Env template | Suggested domain |
|------|----------------|---------|--------------|------------------|
| Customer | `apps/customer` | `dist` | `NETLIFY_CUSTOMER.env.example` | `https://order.restaurant.qa` |
| Admin | `apps/admin` | `dist` | `NETLIFY_ADMIN.env.example` | `https://ops.restaurant.qa` |
| Driver | `apps/driver` | `dist` | `NETLIFY_DRIVER.env.example` | `https://driver.restaurant.qa` |

Local verification before push:

```bash
npm ci
npm run build:web
```

### Customer site

- Base directory: `apps/customer`
- Build / publish / edge functions: defined in `apps/customer/netlify.toml`
- Copy variables from `NETLIFY_CUSTOMER.env.example`
- Private edge runtime: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (never `VITE_*`)
- Optional: `VITE_DRIVER_WEB_URL` = driver site URL (web fallback when opening driver from customer native shell)

Includes SPA fallback, cache headers, and Edge Functions under `netlify/edge-functions` (`/api/menu`, `/api/promotions`, `/api/suggestions`).

### Admin site

- Base directory: `apps/admin`
- Build / publish: `apps/admin/netlify.toml`
- Copy variables from `NETLIFY_ADMIN.env.example`
- **Required cross-links:** `VITE_CUSTOMER_ORIGIN` (customer URL), `VITE_DRIVER_PORTAL_URL` (driver URL)

### Driver site

- Base directory: `apps/driver`
- Build / publish: `apps/driver/netlify.toml`
- Copy variables from `NETLIFY_DRIVER.env.example`
- Driver auth is email/password only; no extra Supabase redirect URLs for this host (unlike customer magic links).

## 2. Netlify Variable Rules

Use these rules consistently:

- Any variable starting with `VITE_` is public and ends up in the browser bundle.
- Never put `SUPABASE_SERVICE_ROLE_KEY`, payment secrets, SMTP credentials, or API tokens in `VITE_*`.
- For the customer site, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are private Netlify runtime values used only by Netlify Edge Functions.

Files created for copy/paste:

- `NETLIFY_CUSTOMER.env.example`
- `NETLIFY_ADMIN.env.example`
- `NETLIFY_DRIVER.env.example`
- `SUPABASE_PRODUCTION_SECRETS.env.example`

## 3. Supabase Auth Production Settings

Open Supabase Dashboard -> Authentication and configure these before go-live.

### URL Configuration

Because the customer app sends `emailRedirectTo` to `/auth/callback`, set:

- Site URL: `https://order.restaurant.qa`
- Additional Redirect URLs:
  - `https://order.restaurant.qa/auth/callback`
  - `https://order.restaurant.qa`
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173`

If you want Netlify preview deploys to support auth emails too, also add a preview wildcard such as:

- `https://**--your-customer-site.netlify.app/**`

Use exact production URLs for production. Keep wildcards only for previews/local development.

### Email Templates

Because the app passes a redirect URL from the client, update your Supabase Auth email templates to use `{{ .RedirectTo }}` instead of `{{ .SiteURL }}` where the confirmation link is rendered.

### SMTP / Email Delivery

Supabase's default email sender is not production-ready for a public launch. For live email login you must configure a custom SMTP provider in:

- Supabase Dashboard -> Authentication -> SMTP Settings

You will need:

- SMTP host
- SMTP port
- SMTP username
- SMTP password
- sender email
- sender name

Important: a strict "Netlify + Supabase only" runtime is not fully possible for public email auth, because production email delivery still requires an external SMTP/email provider.

## 4. Supabase Hooks, Functions, and Secrets

### Custom Access Token Hook

This repo includes `supabase/functions/auth-hook/index.ts`, intended for:

- Supabase Dashboard -> Authentication -> Hooks -> Custom Access Token Hook

Set the hook URL to:

- `https://<project-ref>.functions.supabase.co/auth-hook`

Production hardening note:

- The current hook injects role claims from the `staff` table.
- Before public launch, harden this hook to verify the incoming hook signature according to the current Supabase custom access token hook documentation.

### Edge Function Secrets

Set the values from `SUPABASE_PRODUCTION_SECRETS.env.example` in:

- Supabase Dashboard -> Edge Functions -> Secrets

Core ones from this codebase are:

- `CUSTOMER_APP_URL`
- `OPERATOR_SECRETS_MASTER_KEY`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

Optional integrations only if you actively use them:

- `QPAY_*`
- `STRIPE_*`
- `TWILIO_*`
- `RESEND_*`

### Webhook URLs

If you enable payments, configure providers to call Supabase Edge Functions:

- QPay webhook -> `https://<project-ref>.functions.supabase.co/qpay-webhook`
- Stripe webhook -> `https://<project-ref>.functions.supabase.co/stripe-webhook`

`CUSTOMER_APP_URL` must point to the live customer domain because payment success/cancel URLs are built from it.

## 5. Netlify <-> Supabase Runtime Boundary

If your goal is to keep production centered on Netlify + Supabase:

- Host `apps/customer`, `apps/admin`, and `apps/driver` on Netlify (three sites).
- Keep all data, auth, business logic, and webhooks in Supabase.
- Do not move any backend logic outside Supabase.

But the current repository has optional third-party integrations you should explicitly decide on:

- `Sentry` for browser error reporting
- `Stripe` and `QPay` for payments
- `Twilio` for SMS notifications
- `Resend` or another SMTP provider for email delivery

If you want the leanest Netlify + Supabase deployment:

- leave Sentry disabled
- keep payment gateway features disabled until credentials are ready
- keep SMS notifications disabled until Twilio is configured
- understand that public email auth still needs SMTP/email infrastructure

## 6. Go-Live Checklist

- Create the customer Netlify site and apply `NETLIFY_CUSTOMER.env.example`
- Create the admin Netlify site and apply `NETLIFY_ADMIN.env.example` (include `VITE_DRIVER_PORTAL_URL`)
- Create the driver Netlify site and apply `NETLIFY_DRIVER.env.example`
- Set custom domains for customer, admin, and driver
- On customer (optional native/web): set `VITE_DRIVER_WEB_URL` to the driver site URL
- Configure Supabase Auth URL settings for the customer domain
- Configure production SMTP in Supabase Auth
- Update Supabase Auth email templates to use `{{ .RedirectTo }}`
- Add Supabase Edge Function secrets from `SUPABASE_PRODUCTION_SECRETS.env.example`
- Connect the custom access token hook to `auth-hook`
- Add Stripe/QPay/Twilio/Resend only if those features are required
- Verify one full login flow, one order flow, and one cache invalidation flow in production
