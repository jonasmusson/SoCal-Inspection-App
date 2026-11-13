/*
# Check-In Draft Autosave and Resume Support

## Purpose
Field testing revealed that all check-in data was lost if the user navigated away,
received a phone call, or backgrounded the browser before completing check-in.
This migration adds the database infrastructure needed for continuous autosaving
and resuming incomplete check-ins.

## Changes (all additive — no data loss)

### 1. New column on `inspections`: `checkin_step`
- Type: smallint, default 1, nullable
- Tracks which step of the check-in flow the user was on (1 = vehicle/customer info,
  2 = media/assignment). Used to restore the user to the correct screen on resume.

### 2. New column on `checkin_photos`: `upload_status`
- Type: text, default 'saved', NOT NULL
- Check constraint: one of 'uploading', 'saved', 'failed'
- Tracks the real state of each photo so the UI can show truthful upload status
  and allow retrying failed uploads.

### 3. RLS policy changes on `inspections`
- New UPDATE policy `inspections_update_creator` allows the user who created the
  inspection (created_by = auth.uid()) to update it during the draft phase. This is
  needed because the current UPDATE policy only allows the assigned tech or
  managers — but during check-in the creator may not have assigned a tech yet,
  and the creator may be a manager who is also the one doing the check-in.
- The existing `inspections_update_assigned` policy is kept.

### 4. RLS policy changes on `checkin_photos`
- New UPDATE policy `checkin_photos_update_creator` allows the inspection's
  creator to update the upload_status of photo records they created.
- The existing SELECT and INSERT policies are kept.

### 5. Grant additions
- GRANT UPDATE on `checkin_photos` to `authenticated` (needed for updating
  upload_status — the table previously only had SELECT/INSERT/DELETE grants).
- The `inspections` table already has UPDATE granted.

## Security Notes
- The creator UPDATE policy on inspections is scoped to `created_by = auth.uid()`,
  so a user can only update inspections they created — not other people's.
- The checkin_photos UPDATE policy checks ownership through the parent inspection's
  `created_by` field, ensuring only the original check-in creator can change photo
  status.
- No existing policies are dropped or weakened.
*/

-- 1. Add checkin_step to inspections
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS checkin_step smallint DEFAULT 1;

-- 2. Add upload_status to checkin_photos
ALTER TABLE checkin_photos ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'saved';

-- Add check constraint for upload_status values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkin_photos_upload_status_check'
  ) THEN
    ALTER TABLE checkin_photos
    ADD CONSTRAINT checkin_photos_upload_status_check
    CHECK (upload_status IN ('uploading', 'saved', 'failed'));
  END IF;
END $$;

-- 3. New UPDATE policy on inspections for the creator
-- Allows the person who started the check-in to autosave draft fields
DROP POLICY IF EXISTS "inspections_update_creator" ON inspections;
CREATE POLICY "inspections_update_creator"
ON inspections FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- 4. New UPDATE policy on checkin_photos for the inspection creator
DROP POLICY IF EXISTS "checkin_photos_update_creator" ON checkin_photos;
CREATE POLICY "checkin_photos_update_creator"
ON checkin_photos FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM inspections
    WHERE inspections.id = checkin_photos.inspection_id
    AND inspections.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM inspections
    WHERE inspections.id = checkin_photos.inspection_id
    AND inspections.created_by = auth.uid()
  )
);

-- 5. Grant UPDATE on checkin_photos to authenticated
-- (Previously only SELECT, INSERT, DELETE were granted)
GRANT UPDATE ON checkin_photos TO authenticated;

-- 6. Add index for finding incomplete check-ins efficiently
CREATE INDEX IF NOT EXISTS inspections_checkin_incomplete_idx
ON inspections (created_by, checkin_complete, created_at DESC)
WHERE checkin_complete = false;
