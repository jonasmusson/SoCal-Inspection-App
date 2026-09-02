-- PostgreSQL grants EXECUTE to PUBLIC on every new function by default.
-- Revoking from specific roles leaves the PUBLIC grant intact, which is
-- why anon/authenticated can still call these. Revoking from PUBLIC
-- removes the default and covers all roles including anon and authenticated.

REVOKE EXECUTE ON FUNCTION public.get_all_profiles()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tech_profiles()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_owner()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_search_vector()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
