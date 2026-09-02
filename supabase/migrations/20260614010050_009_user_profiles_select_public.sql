-- Remove the TO authenticated restriction so the policy applies to ALL roles.
-- This ensures profile reads work even if the JWT role claim isn't propagated.
DROP POLICY IF EXISTS "select_user_profiles" ON user_profiles;

CREATE POLICY "select_user_profiles" ON user_profiles FOR SELECT
  USING (true);