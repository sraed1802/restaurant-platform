# Phase 3 Platform Sequencing

## Dependency Order
1. Tenant scope and feature-flag rollout controls
2. OAuth provider support
3. GDPR data lifecycle tooling
4. Multi-location schema and routing rollout
5. Tenant-aware analytics expansion

## Why This Order

### OAuth Before GDPR Self-Service
- OAuth changes customer identity flows, callback handling, and consent capture.
- Ship provider login first so downstream privacy workflows attach to the right identity model.

### GDPR Before Multi-Location Scale
- Deletion, export, and retention flows become harder once data is spread across more modules and properties.
- Build privacy workflows while the domain graph is still smaller.

### Multi-Location Before Advanced Analytics
- Analytics dimensions should be designed once around tenant/property scope.
- If chain-level analytics ships before property-aware scoping, reporting logic will need rework.

## Work Breakdown

### OAuth
- Extend current auth callback path.
- Add provider buttons to customer/admin login.
- Normalize post-login routing and account linking.

### GDPR
- Add consent records.
- Add export job and downloadable archive flow.
- Add account deletion request pipeline.
- Expand audit logging for privacy actions.

### Multi-Location
- Retrofit high-value core tables first:
  - orders
  - customers
  - products
  - payments
  - audit_logs
  - analytics_events
- Replace singleton restaurant settings with property-scoped settings.
- Thread tenant scope through service and UI routing layers.

### Analytics
- Promote analytics views and dashboards only after location scope is stable.
- Add chain summary plus property drill-down.
- Separate operational dashboards from campaign and finance dashboards.

## Release Strategy
- Keep every stage behind feature flags.
- Roll out tenant-aware analytics only after one property has successfully exercised the new tenant model end to end.
