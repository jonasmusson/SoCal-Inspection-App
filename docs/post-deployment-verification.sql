-- ============================================================
-- Post-Deployment Verification SQL
-- Run AFTER applying docs/PENDING-security-hardening-migration.sql
-- via the Supabase MCP apply_migration tool.
--
-- This script verifies that all security properties hold at the
-- database level. Each query returns a result that should match
-- the expected value documented in the comment above it.
-- ============================================================

-- 1. Verify: can_modify_role no longer exists (replaced by set_user_role)
SELECT
  '1. can_modify_role should not exist' as test,
  count(*) as expected_zero
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'can_modify_role';
-- Expected: count = 0

-- 2. Verify: set_user_role exists and is SECURITY DEFINER with search_path
SELECT
  '2. set_user_role is SECURITY DEFINER' as test,
  security_type,
  routine_definition LIKE '%UPDATE user_profiles SET role = new_role%' as performs_update
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'set_user_role';
-- Expected: security_type = 'DEFINER', performs_update = true

-- 3. Verify: approve_inspection exists and is SECURITY DEFINER
SELECT
  '3. approve_inspection is SECURITY DEFINER' as test,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'approve_inspection';
-- Expected: security_type = 'DEFINER'

-- 4. Verify: resolve_correction exists and is SECURITY DEFINER
SELECT
  '4. resolve_correction is SECURITY DEFINER' as test,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'resolve_correction';
-- Expected: security_type = 'DEFINER'

-- 5. Verify: all new functions have EXECUTE revoked from anon
SELECT
  '5. No anon EXECUTE on new functions' as test,
  routine_name,
  grantee
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
AND grantee = 'anon'
AND routine_name IN ('set_user_role', 'set_user_status', 'approve_inspection',
  'send_inspection_report_fn', 'resolve_correction', 'request_correction_fn',
  'is_active_staff', 'get_caller_role');
-- Expected: 0 rows

-- 6. Verify: user_profiles SELECT is revoked from anon
SELECT
  '6. user_profiles SELECT not granted to anon' as test,
  grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'user_profiles'
AND grantee = 'anon' AND privilege_type = 'SELECT';
-- Expected: 0 rows

-- 7. Verify: user_profiles UPDATE only on non-privileged columns
SELECT
  '7. user_profiles UPDATE columns (should NOT include role/status/deactivated_at)' as test,
  string_agg(column_name, ', ' ORDER BY column_name) as granted_columns
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'user_profiles'
AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
-- Expected: full_name, first_name, last_name, phone (NOT role, status, deactivated_at, email)

-- 8. Verify: inspections UPDATE does NOT include protected columns
SELECT
  '8. inspections UPDATE columns (should NOT include report_approved/approved_by/etc)' as test,
  string_agg(column_name, ', ' ORDER BY column_name) as granted_columns
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'inspections'
AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
AND column_name IN ('report_approved', 'report_sent', 'report_sent_at',
  'approved_at', 'approved_by', 'correction_notes', 'correction_requested_at');
-- Expected: 0 rows (none of these columns should be granted)

-- 9. Verify: inspections SELECT policy is NOT USING(true)
SELECT
  '9. inspections SELECT policy (should NOT be USING true)' as test,
  policyname, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'inspections' AND cmd = 'SELECT';
-- Expected: policyname = 'inspections_select_authorized', qual should contain
--   is_manager_or_owner OR assigned_tech_id = auth.uid() OR created_by = auth.uid()

-- 10. Verify: user_profiles SELECT policy is own-or-manager (not USING true)
SELECT
  '10. user_profiles SELECT policy (should NOT be USING true)' as test,
  policyname, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_profiles' AND cmd = 'SELECT';
-- Expected: policyname = 'profiles_select_own_or_staff', qual should contain
--   id = auth.uid() OR is_manager_or_owner()

-- 11. Verify: hub tables are untouched (still have their original policies)
SELECT
  '11. Hub tables still have their policies' as test,
  tablename, count(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'hub_%'
GROUP BY tablename
ORDER BY tablename;
-- Expected: hub_pilot_media (2), hub_pilot_members (1), hub_pilot_orgs (1),
--   hub_pilot_projects (3), hub_pilot_vehicles (3), hub_upload_jobs (1),
--   hub_vehicle_assignments (1), hub_work_entries (1)

-- ============================================================
-- POSITIVE/NEGATIVE PERMISSION TESTS
-- Run these manually by signing in as each user type and checking results.
-- After applying the migration, create test users for each role and verify:
--
-- OWNER:
--   - Can read all inspections (SELECT count > 0)
--   - Can approve inspections (RPC approve_inspection succeeds)
--   - Can send reports (RPC send_inspection_report_fn succeeds)
--   - Can resolve corrections (RPC resolve_correction succeeds)
--   - Can change user roles (RPC set_user_role succeeds)
--   - Can deactivate users (RPC set_user_status succeeds)
--   - Cannot deactivate self (RPC set_user_status raises exception)
--   - Cannot deactivate last owner (RPC set_user_status raises exception)
--
-- MANAGER:
--   - Can read all inspections
--   - Can approve inspections (RPC succeeds)
--   - Can send reports (RPC succeeds)
--   - Can resolve corrections (RPC succeeds)
--   - Can change roles to tech/manager (RPC set_user_role succeeds)
--   - Cannot set owner role (RPC raises exception)
--   - Cannot deactivate self (RPC raises exception)
--
-- TECHNICIAN:
--   - Can read only assigned inspections
--   - Can update inspection_items for assigned inspections
--   - Can set status to in_progress/pending_review
--   - CANNOT approve inspections (RPC raises exception)
--   - CANNOT send reports (RPC raises exception)
--   - CANNOT resolve corrections (RPC raises exception)
--   - CANNOT request corrections (RPC raises exception)
--   - CANNOT update report_approved via direct API (column grant revoked)
--   - CANNOT update approved_by via direct API (column grant revoked)
--   - CANNOT update correction_notes via direct API (column grant revoked)
--   - CANNOT change user roles (RPC raises exception)
--
-- DEACTIVATED:
--   - Cannot read ANY inspections (RLS rejects — 0 rows)
--   - Cannot update any inspection items (RLS rejects)
--   - Cannot call any RPC functions (all check is_active_staff/is_manager_or_owner)
--
-- PENDING:
--   - Cannot read inspections (is_active_staff returns false)
--   - Cannot update any data (all policies check status='active')
-- ============================================================
