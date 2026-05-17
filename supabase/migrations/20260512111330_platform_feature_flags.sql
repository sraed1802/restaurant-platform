-- Phase 0 foundation: feature flags with tenant-aware scope for staged rollouts
CREATE TABLE IF NOT EXISTS feature_flags (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key           text NOT NULL,
  description        text,
  enabled            boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  rules              jsonb NOT NULL DEFAULT '{}'::jsonb,
  organization_id    uuid,
  cluster_id         uuid,
  property_id        uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_scope_key
  ON feature_flags (flag_key, organization_id, cluster_id, property_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_feature_flags_scope
  ON feature_flags (organization_id, cluster_id, property_id);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_staff_read" ON feature_flags;
CREATE POLICY "feature_flags_staff_read" ON feature_flags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      WHERE s.id = auth.uid()
        AND s.is_active = true
    )
  );

DROP TRIGGER IF EXISTS set_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER set_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
