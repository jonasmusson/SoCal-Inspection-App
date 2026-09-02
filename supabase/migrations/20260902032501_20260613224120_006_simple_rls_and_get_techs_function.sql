-- Drop the recursive policy entirely
DROP POLICY IF EXISTS "select_user_profiles" ON user_profiles;

-- Simple, non-recursive: each user can only read their own row
CREATE POLICY "select_user_profiles" ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Create a SECURITY DEFINER function that bypasses RLS to fetch tech list
-- This runs as the function owner (superuser) so RLS is not applied
CREATE OR REPLACE FUNCTION get_tech_profiles()
RETURNS SETOF user_profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM user_profiles WHERE role = 'tech' ORDER BY full_name;
$$;