-- Track pause/resume so labor time is accurate despite interruptions
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_duration_seconds INTEGER NOT NULL DEFAULT 0;
