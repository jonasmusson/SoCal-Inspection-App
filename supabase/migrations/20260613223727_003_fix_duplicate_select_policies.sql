-- Drop both conflicting SELECT policies
DROP POLICY IF EXISTS "users_select_own" ON user_profiles;
DROP POLICY IF EXISTS "managers_view_all" ON user_profiles;

-- Single SELECT policy: users can always read their own row
-- Managers/owners can read all rows via the security definer function
CREATE POLICY "select_user_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id OR is_manager_or_owner()
  );