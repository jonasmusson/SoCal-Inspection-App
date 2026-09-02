-- Report-ready findings for the premium customer inspection report.
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS executive_summary text,
  ADD COLUMN IF NOT EXISTS primary_recommendation text;

ALTER TABLE inspection_items
  ADD COLUMN IF NOT EXISTS impact text,
  ADD COLUMN IF NOT EXISTS recommended_action text,
  ADD COLUMN IF NOT EXISTS not_inspected_reason text,
  ADD COLUMN IF NOT EXISTS labor_hours_low numeric(8,2),
  ADD COLUMN IF NOT EXISTS labor_hours_high numeric(8,2),
  ADD COLUMN IF NOT EXISTS parts_cost_low numeric(12,2),
  ADD COLUMN IF NOT EXISTS parts_cost_high numeric(12,2);

-- Allow 'not_inspected' as a valid inspection_items status
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'inspection_items'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE inspection_items DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE inspection_items
  ADD CONSTRAINT inspection_items_status_check
  CHECK (status IS NULL OR status IN ('good', 'monitor', 'needs_attention', 'not_inspected')),
  ADD CONSTRAINT inspection_items_labor_range_check
  CHECK (labor_hours_low IS NULL OR labor_hours_high IS NULL OR labor_hours_high >= labor_hours_low),
  ADD CONSTRAINT inspection_items_parts_range_check
  CHECK (parts_cost_low IS NULL OR parts_cost_high IS NULL OR parts_cost_high >= parts_cost_low);
