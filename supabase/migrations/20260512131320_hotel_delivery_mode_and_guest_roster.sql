-- Hotel room delivery mode, scoped fulfillment settings, and guest roster support.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS cluster_id uuid,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'outside_delivery';

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_mode_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_fulfillment_mode_check
  CHECK (fulfillment_mode IN ('outside_delivery', 'hotel_room_delivery'));

CREATE INDEX IF NOT EXISTS idx_orders_scope
  ON orders(organization_id, cluster_id, property_id);

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_mode
  ON orders(fulfillment_mode);

CREATE TABLE IF NOT EXISTS fulfillment_settings (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  fulfillment_mode  text NOT NULL DEFAULT 'outside_delivery'
                    CHECK (fulfillment_mode IN ('outside_delivery', 'hotel_room_delivery')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_settings_scope_unique
  ON fulfillment_settings (organization_id, cluster_id, property_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_fulfillment_settings_scope
  ON fulfillment_settings (organization_id, cluster_id, property_id);

DROP TRIGGER IF EXISTS trg_fulfillment_settings_updated_at ON fulfillment_settings;
CREATE TRIGGER trg_fulfillment_settings_updated_at
  BEFORE UPDATE ON fulfillment_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fulfillment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fulfillment_settings_staff_read" ON fulfillment_settings;
CREATE POLICY "fulfillment_settings_staff_read" ON fulfillment_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS hotel_guest_roster (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid,
  cluster_id        uuid,
  property_id       uuid,
  room_number       text NOT NULL,
  guest_name        text NOT NULL,
  phone             text,
  email             text,
  check_in_date     date,
  check_out_date    date,
  notes             text,
  source_file_name  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(room_number)) > 0),
  CHECK (length(trim(guest_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_guest_roster_scope_room_guest_unique
  ON hotel_guest_roster (organization_id, cluster_id, property_id, room_number, guest_name) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_hotel_guest_roster_scope
  ON hotel_guest_roster (organization_id, cluster_id, property_id);

CREATE INDEX IF NOT EXISTS idx_hotel_guest_roster_scope_room
  ON hotel_guest_roster (organization_id, cluster_id, property_id, room_number);

DROP TRIGGER IF EXISTS trg_hotel_guest_roster_updated_at ON hotel_guest_roster;
CREATE TRIGGER trg_hotel_guest_roster_updated_at
  BEFORE UPDATE ON hotel_guest_roster
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE hotel_guest_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hotel_guest_roster_staff_read" ON hotel_guest_roster;
CREATE POLICY "hotel_guest_roster_staff_read" ON hotel_guest_roster
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );
