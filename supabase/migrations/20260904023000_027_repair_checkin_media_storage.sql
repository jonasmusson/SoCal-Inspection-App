-- Restore least-privilege check-in media uploads.
-- Media paths begin with the inspection UUID. Uploads are limited to the
-- inspection creator, assigned technician, or an active manager/owner.

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
