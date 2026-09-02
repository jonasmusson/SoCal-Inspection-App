-- Add archived flag to inspections
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for filtering non-archived inspections
CREATE INDEX IF NOT EXISTS inspections_archived_idx ON inspections (archived) WHERE archived = FALSE;

-- Allow owners/managers to delete inspections
CREATE POLICY "owners_managers_delete_inspections" ON inspections FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );
