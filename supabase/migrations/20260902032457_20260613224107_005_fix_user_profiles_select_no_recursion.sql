-- The select_user_profiles policy calls is_manager_or_owner() which queries
-- user_profiles, which triggers the same policy = infinite recursion.
-- Fix: user_profiles SELECT uses only auth.uid() = id (no function call).
-- Managers can still see all profiles via a separate inline subquery that
-- does NOT call is_manager_or_owner().

DROP POLICY IF EXISTS "select_user_profiles" ON user_profiles;

CREATE POLICY "select_user_profiles" ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM user_profiles up2
      WHERE up2.id = auth.uid()
        AND up2.role IN ('manager', 'owner')
    )
  );