-- Security definer function so Settings page can list all team members
-- bypasses RLS safely (runs as function owner, not the calling user)
CREATE OR REPLACE FUNCTION get_all_profiles()
RETURNS SETOF user_profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM user_profiles ORDER BY created_at ASC;
$$;