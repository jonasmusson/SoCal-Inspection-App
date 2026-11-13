/*
# Admin Enhancement Fields

## Purpose
Add fields needed for the manager review workflow, correction requests,
user deactivation, and approval attribution.

## Changes to `inspections` table
- `approved_by` (uuid, nullable) — references user_profiles.id, records who approved the report
- `correction_notes` (text, nullable) — manager's notes when requesting a correction from the technician
- `correction_requested_at` (timestamptz, nullable) — timestamp when correction was requested

## Changes to `inspection_items` table
- `manager_note` (text, nullable) — per-item manager annotation that does not overwrite technician notes

## Changes to `user_profiles` table
- `deactivated_at` (timestamptz, nullable) — timestamp when user was deactivated (null = active)

## Security
- No new tables, so no new RLS policies needed
- Existing RLS policies on inspections, inspection_items, and user_profiles remain in effect
- The `approved_by` column is a FK to user_profiles but does not change access patterns
- No GRANT changes needed — existing grants cover the new columns automatically

## Important Notes
1. All new columns are nullable so existing rows are unaffected
2. The `approved_by` FK uses ON DELETE SET NULL so deleting a user doesn't break inspection history
3. The `deactivated_at` column supplements (does not replace) the existing `status` column
4. Template updates still do not affect existing inspections — inspection_items are copies, not references
*/

-- Add approved_by to inspections
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Add correction workflow fields to inspections
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS correction_notes text;
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS correction_requested_at timestamptz;

-- Add per-item manager note to inspection_items
ALTER TABLE inspection_items
  ADD COLUMN IF NOT EXISTS manager_note text;

-- Add deactivation tracking to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;