/*
# Post-Deployment Verification v3
#
# Run these queries AFTER applying the security hardening migration to verify
# effective privileges for all 5 account types: Owner, Manager, Technician,
# Pending, and Deactivated.
#
# Each section shows the EXPECTED result and the query to verify it.
# All queries run as the service_role / postgres so they can inspect
# system catalogs. For role-specific behavior tests, see section 7.
*/

-- ============================================================
-- 1. Verify inspections column-level UPDATE grant
--    Protected columns must NOT be in the UPDATE grant list.
-- ============================================================

-- EXPECTED: Only the columns listed in the migration's GRANT UPDATE.
-- Should NOT include: report_approved, report_sent, report_sent_at,
-- approved_at, approved_by, correction_notes, correction_requested_at
SELECT column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'inspections'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;

-- ============================================================
-- 2. Verify user_profiles column-level UPDATE grant
--    Protected columns must NOT be in the UPDATE grant list.
-- ============================================================

-- EXPECTED: full_name, first_name, last_name, phone only
-- Should NOT include: role, status, deactivated_at, email
SELECT column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'user_profiles'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;

-- ============================================================
-- 3. Verify NO table-level UPDATE grant on inspections
-- ============================================================

-- EXPECTED: No rows (table-level UPDATE is revoked)
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'inspections'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE';

-- ============================================================
-- 4. Verify all policies on inspections use is_active_staff or is_manager_or_owner
-- ============================================================

-- EXPECTED: Every policy predicate mentions is_active_staff or is_manager_or_owner
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'inspections'
ORDER BY cmd;

-- ============================================================
-- 5. Verify no legacy permissive policies remain
-- ============================================================

-- EXPECTED: No policies with USING (true) on any inspection table
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('inspections', 'user_profiles', 'inspection_items',
    'inspection_sections', 'inspection_photos', 'inspection_videos',
    'checkin_photos', 'email_templates', 'inspection_templates',
    'template_sections', 'template_items', 'shop_settings')
  AND qual = 'true';

-- ============================================================
-- 6. Verify profiles_delete_owner includes last-owner protection
-- ============================================================

-- EXPECTED: The DELETE policy predicate contains "last active owner" check
SELECT policyname, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_profiles' AND cmd = 'DELETE';

-- ============================================================
-- 7. Role-specific behavior tests (run as each role)
--
-- These require connecting as specific users. In Supabase, you can
# use the SQL editor with set_config('request.jwt.claims', ...) or
-- create test functions. Below are test templates.
-- ============================================================

-- Test: Technician cannot set status to 'approved'
-- Connect as a tech user, run:
-- UPDATE inspections SET status = 'approved' WHERE id = '<some_inspection_id>';
-- EXPECTED: ERROR — RLS WITH CHECK violation or column privilege error

-- Test: Technician cannot set report_approved
-- Connect as a tech user, run:
-- UPDATE inspections SET report_approved = true WHERE id = '<some_inspection_id>';
-- EXPECTED: ERROR — column-level privilege denied

-- Test: Deactivated user cannot SELECT inspections
-- Connect as a deactivated user (status='pending', deactivated_at set), run:
-- SELECT count(*) FROM inspections;
-- EXPECTED: 0 rows (is_active_staff returns false)

-- Test: Pending user cannot SELECT inspections
-- Connect as a pending user (status='pending'), run:
-- SELECT count(*) FROM inspections;
-- EXPECTED: 0 rows (is_active_staff returns false)

-- Test: Manager can approve via RPC
-- Connect as a manager, run:
-- SELECT approve_inspection('<inspection_id>');
-- EXPECTED: Success

-- Test: Technician cannot approve via RPC
-- Connect as a tech, run:
-- SELECT approve_inspection('<inspection_id>');
-- EXPECTED: ERROR — 'Only active managers or owners can approve reports'

-- Test: Technician cannot call set_user_role
-- Connect as a tech, run:
-- SELECT set_user_role('<target_user_id>', 'manager');
-- EXPECTED: ERROR — 'Only managers or owners can change user roles'

-- Test: Last owner cannot be deleted
-- Connect as the sole owner, run:
-- DELETE FROM user_profiles WHERE id = '<own_id>';
-- EXPECTED: 0 rows deleted (policy blocks it)

-- Test: Last owner cannot be deactivated
-- Connect as a manager, run:
-- SELECT set_user_status('<owner_id>', 'pending');
-- EXPECTED: ERROR — 'Cannot deactivate the last active owner'

-- Test: Last owner cannot be demoted
-- Connect as a manager, run:
-- SELECT set_user_role('<owner_id>', 'manager');
-- EXPECTED: ERROR — 'Cannot demote the last active owner'

-- ============================================================
-- 8. Verify SECURITY DEFINER function grants
-- ============================================================

-- EXPECTED: All functions have EXECUTE granted to authenticated only, not anon
SELECT routine_name, grantee
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('set_user_role', 'set_user_status', 'approve_inspection',
    'send_inspection_report_fn', 'resolve_correction', 'request_correction_fn',
    'is_active_staff', 'get_caller_role', 'is_manager_or_owner',
    'get_all_profiles', 'get_tech_profiles')
  AND grantee IN ('anon', 'authenticated')
ORDER BY routine_name, grantee;

-- ============================================================
-- 9. Verify HUB tables are untouched
-- ============================================================

-- EXPECTED: hub_* tables still have their original policies and grants
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'hub_%'
ORDER BY tablename, cmd;
