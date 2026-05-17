-- Audit logs for critical actions (payment collection, staff actions, etc.)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      text NOT NULL,
  actor_id    uuid,
  actor_role  text,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Staff can read audit logs
DROP POLICY IF EXISTS "audit_logs_staff_read" ON audit_logs;
CREATE POLICY "audit_logs_staff_read" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM staff s WHERE s.id = auth.uid() AND s.is_active = true)
  );

