/*
# Repair check-in media storage INSERT policy

1. Purpose
   Restores least-privilege check-in media uploads. Media paths begin with
   the inspection UUID. Uploads are limited to the inspection creator, the
   assigned technician, or an active manager/owner.

2. Changes
   - Drops and recreates the `checkin_media_insert` INSERT policy on
     `storage.objects` for the `checkin-photos` and `checkin-videos` buckets.
   - The new WITH CHECK verifies that:
     a) The object is being uploaded to one of the two check-in media buckets.
     b) The first path segment (folder) matches an existing inspection's UUID.
     c) The authenticated user is the inspection creator, the assigned tech,
        or an active manager/owner.

3. Data Safety
   - No tables, columns, rows, buckets, or user data are modified or deleted.
   - Only the INSERT policy on storage.objects is replaced.
   - Existing media in both buckets remains readable and is not touched.

4. Security
   - The policy is scoped to `TO authenticated`.
   - Only the inspection creator, assigned technician, or an active
     manager/owner can upload media files to the check-in buckets.
*/

DROP POLICY IF EXISTS "checkin_media_insert" ON storage.objects;

CREATE POLICY "checkin_media_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('checkin-photos', 'checkin-videos')
  AND EXISTS (
    SELECT 1
    FROM public.inspections inspection
    WHERE inspection.id::text = (storage.foldername(name))[1]
      AND (
        inspection.created_by = auth.uid()
        OR inspection.assigned_tech_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_profiles profile
          WHERE profile.id = auth.uid()
            AND profile.role IN ('manager', 'owner')
            AND profile.status = 'active'
        )
      )
  )
);
