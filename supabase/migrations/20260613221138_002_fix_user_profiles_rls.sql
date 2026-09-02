-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "users_select_own" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own" ON user_profiles;
DROP POLICY IF EXISTS "users_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "managers_view_all" ON user_profiles;

-- Create new policies without recursion
-- Users can always view their own profile
CREATE POLICY "users_select_own" ON user_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Profiles are inserted by the auth trigger. Users must never be allowed to
-- assign their own role or approve their own account.

-- Use a security definer function to check role without recursion
CREATE OR REPLACE FUNCTION is_manager_or_owner()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM user_profiles WHERE id = auth.uid();
  RETURN user_role IN ('manager', 'owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Managers and owners can view all users
CREATE POLICY "managers_view_all" ON user_profiles FOR SELECT
  TO authenticated USING (is_manager_or_owner() OR auth.uid() = id);
