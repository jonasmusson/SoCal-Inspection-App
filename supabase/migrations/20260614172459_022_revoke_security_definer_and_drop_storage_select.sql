-- ============================================================
-- 1. Fix user_profiles UPDATE policy to remove is_manager_or_owner() call
--    (inline EXISTS so we can fully revoke the function)
-- ============================================================
DROP POLICY IF EXISTS managers_update_all ON user_profiles;

CREATE POLICY managers_update_all ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('manager', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('manager', 'owner')
    )
  );

-- ============================================================
-- 2. Revoke all EXECUTE grants on SECURITY DEFINER functions
--    from anon and authenticated roles.
--
--    Trigger functions (update_updated_at_column, update_search_vector)
--    are invoked by the trigger mechanism — no role grant needed.
--
--    get_all_profiles / get_tech_profiles are replaced by direct
--    table queries in the app (user_profiles has open SELECT for
--    authenticated via select_user_profiles policy).
--
--    is_manager_or_owner is no longer referenced in any RLS policy
--    (all policies now use inline EXISTS subqueries).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_search_vector()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_profiles()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tech_profiles()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_owner()       FROM anon, authenticated;

-- ============================================================
-- 3. Drop storage SELECT policies that allow bucket listing.
--    Public CDN URLs for inspection-photos and inspection-videos
--    are served directly by the CDN — no storage SELECT policy
--    is required for URL-based object access.
-- ============================================================
DROP POLICY IF EXISTS "insp_photos_storage_select"      ON storage.objects;
DROP POLICY IF EXISTS "insp_videos_storage_select_auth" ON storage.objects;
