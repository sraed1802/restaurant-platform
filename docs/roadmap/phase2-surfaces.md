# Phase 2 Surfaces And Modules

## New Product Surfaces

### Driver Surface
- Recommended package/app: `apps/driver`
- Responsibilities:
  - assigned orders
  - status updates
  - live location publishing
  - customer chat
  - proof-of-delivery capture
- Core backend modules:
  - `driver_locations`
  - `driver_conversations`
  - `driver_messages`
  - `delivery_proofs`

### Scheduling Surface
- Customer:
  - add schedule selection into checkout and orders
- Admin:
  - time-slot management
  - override and exception handling
- Backend modules:
  - `time_slots`
  - `scheduled_orders`
  - reminder dispatch jobs

### Fleet And Dispatch Surface
- Keep this in admin initially, but isolate it as a dedicated dispatch module.
- Responsibilities:
  - route suggestions
  - batched assignments
  - live driver map
  - SLA views
- Backend modules:
  - `dispatch_runs`
  - `route_recommendations`
  - `fleet_events`

### Staff Scheduling Surface
- Admin:
  - roster planning
  - attendance review
  - shift swaps and approvals
- Staff:
  - self-service schedule view
  - leave requests
- Backend modules:
  - `staff_shifts`
  - `staff_shift_assignments`
  - `attendance_events`
  - `leave_requests`

### Messaging And Notifications Surface
- Customer app:
  - in-app notification center
  - driver/support conversation view
- Admin:
  - campaign sending
  - notification health
  - escalation queue
- Backend modules:
  - `notification_preferences`
  - `push_devices`
  - `campaigns`
  - `campaign_targets`
  - `campaign_deliveries`

## Shared Module Rules
- Every new table must include tenant scope fields.
- Realtime channels must be partitioned by tenant and entity.
- Chat and tracking should not be embedded into `orders` rows.
- Media uploads should use dedicated storage buckets with tenant-aware policies.
