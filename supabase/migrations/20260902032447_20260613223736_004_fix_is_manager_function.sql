-- Rebuild is_manager_or_owner to explicitly bypass RLS with SET LOCAL
CREATE OR REPLACE FUNCTION is_manager_or_owner()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- SECURITY DEFINER runs as the function owner, bypassing RLS
  SELECT role INTO user_role FROM user_profiles WHERE id = auth.uid();
  RETURN COALESCE(user_role IN ('manager', 'owner'), false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;