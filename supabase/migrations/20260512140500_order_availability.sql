-- Per-property order availability: manual overrides, weekly schedule, and one-off date/time windows.

CREATE TABLE IF NOT EXISTS order_availability_settings (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  manual_mode         text NOT NULL DEFAULT 'scheduled'
                      CHECK (manual_mode IN ('scheduled', 'force_open', 'force_closed')),
  timezone            text NOT NULL DEFAULT 'Asia/Qatar',
  closure_message_en  text,
  closure_message_ar  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(timezone)) > 0)
);

CREATE TABLE IF NOT EXISTS order_availability_weekly_windows (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  day_of_week         int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at            time NOT NULL,
  closes_at           time NOT NULL,
  is_enabled          boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

CREATE TABLE IF NOT EXISTS order_availability_overrides (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid,
  cluster_id          uuid,
  property_id         uuid,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  mode                text NOT NULL CHECK (mode IN ('open', 'closed')),
  label               text,
  message_en          text,
  message_ar          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_availability_settings_scope_unique
  ON order_availability_settings (organization_id, cluster_id, property_id) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_availability_weekly_scope_day_unique
  ON order_availability_weekly_windows (organization_id, cluster_id, property_id, day_of_week) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_order_availability_settings_scope
  ON order_availability_settings (organization_id, cluster_id, property_id);

CREATE INDEX IF NOT EXISTS idx_order_availability_weekly_scope
  ON order_availability_weekly_windows (organization_id, cluster_id, property_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_order_availability_overrides_scope
  ON order_availability_overrides (organization_id, cluster_id, property_id);

CREATE INDEX IF NOT EXISTS idx_order_availability_overrides_window
  ON order_availability_overrides (starts_at, ends_at);

DROP TRIGGER IF EXISTS trg_order_availability_settings_updated_at ON order_availability_settings;
CREATE TRIGGER trg_order_availability_settings_updated_at
  BEFORE UPDATE ON order_availability_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_order_availability_weekly_windows_updated_at ON order_availability_weekly_windows;
CREATE TRIGGER trg_order_availability_weekly_windows_updated_at
  BEFORE UPDATE ON order_availability_weekly_windows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_order_availability_overrides_updated_at ON order_availability_overrides;
CREATE TRIGGER trg_order_availability_overrides_updated_at
  BEFORE UPDATE ON order_availability_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE order_availability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_availability_weekly_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_availability_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_availability_settings_staff_read" ON order_availability_settings;
CREATE POLICY "order_availability_settings_staff_read" ON order_availability_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS "order_availability_weekly_windows_staff_read" ON order_availability_weekly_windows;
CREATE POLICY "order_availability_weekly_windows_staff_read" ON order_availability_weekly_windows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS "order_availability_overrides_staff_read" ON order_availability_overrides;
CREATE POLICY "order_availability_overrides_staff_read" ON order_availability_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );
