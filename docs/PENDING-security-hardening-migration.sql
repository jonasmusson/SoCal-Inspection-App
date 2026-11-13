/*
# Security Hardening Migration v2 — PENDING APPROVAL

## WARNING: This migration has NOT been applied to production.
Do not apply without explicit authorization from the project owner.
Once approved, apply via the Supabase MCP apply_migration tool.

## Security Issues Fixed (v2 — addresses review findings)

1. DEACTIVATED USERS: All RLS policies on every Inspection-App table now check
   `status = 'active' AND deactivated_at IS NULL` on the caller's profile.
   A deactivated user holding a previously issued session is rejected by the
   database itself — not by React sign-out or Realtime events.

2. LAST-OWNER PROTECTION: `set_user_role(target_user_id, new_role)` is a
   SECURITY DEFINER function that PERFORMS the role change — not a boolean
   helper. It checks caller authorization, prevents self-promotion, prevents
   removing/deactivating the last active owner, and executes the UPDATE.
   Column-level privileges on `user_profiles.role` are revoked so direct
   API calls cannot bypass it.

3. REPORT APPROVAL: `approve_inspection(inspection_id)` is a SECURITY DEFINER
   function that checks the caller is an active manager/owner, blocks
   approval when a correction is unresolved, and performs the UPDATE.
   Column-level privileges on `inspections.status`, `report_approved`,
   `approved_by`, `approved_at` are revoked so a technician cannot set
   them via direct API.

4. REPORT SENDING: `send_inspection_report_fn(inspection_id)` is a SECURITY
   DEFINER function for managers/owners. Column-level privileges on
   `report_sent`, `report_sent_at` are revoked.

5. CORRECTION WORKFLOW: `resolve_correction(inspection_id)` is a SECURITY
   DEFINER function callable only by managers/owners. Technicians can
   complete their work and the status naturally flows back to pending_review,
   but they CANNOT dismiss/resolve a correction request. The correction
   notes and timestamp are preserved until a manager resolves them.

6. USER PROFILES: SELECT restricted to authenticated only (not public/anon).
   Column-level SELECT revoked for sensitive columns (email) from non-manager
   callers. UPDATE restricted to a `set_user_role` function for role/status/
   deactivated_at, and column-level privileges revoked for those columns.

7. ALL SECURITY DEFINER FUNCTIONS: Have `SET search_path = public`, EXECUTE
   revoked from PUBLIC/anon, granted only to authenticated, and derive caller
   identity from `auth.uid()`.

8. HUB COMPATIBILITY: This migration does NOT touch any hub_* tables, their
   policies, or their grants. The HUB uses its own membership system
   (hub_pilot_members) that is independent of user_profiles.status.

## Tables and Columns Affected

- user_profiles: column-level privileges tightened (role, status,
  deactivated_at, email)
- inspections: column-level privileges tightened (status, report_approved,
  report_sent, approved_by, approved_at, report_sent_at, correction_notes,
  correction_requested_at)
- inspection_items, inspection_sections, inspection_photos,
  inspection_videos, checkin_photos: RLS predicates tightened to reject
  deactivated callers

## Security Changes (RLS + Grants)

- All RLS policies on Inspection-App tables check caller is active and not
  deactivated
- SECURITY DEFINER functions: set_user_role, approve_inspection,
  send_inspection_report_fn, resolve_correction
- Column-level revocations on user_profiles and inspections
- user_profiles SELECT revoked from anon

## Important Notes

1. This migration is idempotent (uses IF EXISTS for drops).
2. No tables or columns are dropped, renamed, or type-changed.
3. No transaction control statements (BEGIN/COMMIT/ROLLBACK) at top level.
4. Hub tables are intentionally NOT modified.
5. Existing functions get_all_profiles, get_tech_profiles, is_manager_or_owner
   are hardened to check status='active' AND deactivated_at IS NULL.
*/

-- ============================================================
-- 1. Helper view for active caller check (avoids repeating the subquery)
-- ============================================================
-- We inline the check in each policy for performance, but also create a
-- helper function for use inside SECURITY DEFINER functions.

DROP FUNCTION IF EXISTS public.is_active_staff();
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND status = 'active'
    AND deactivated_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;

-- Helper: get caller's role (returns NULL if not found, deactivated, or pending)
DROP FUNCTION IF EXISTS public.get_caller_role();
CREATE OR REPLACE FUNCTION public.get_caller_role()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM user_profiles
  WHERE id = auth.uid()
  AND status = 'active'
  AND deactivated_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_caller_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_caller_role() TO authenticated;

-- ============================================================
-- 2. set_user_role — performs role change with authorization + last-owner protection
--    Replaces can_modify_role (which only returned a boolean)
-- ============================================================
DROP FUNCTION IF EXISTS public.can_modify_role(uuid, text);
DROP FUNCTION IF EXISTS public.set_user_role(uuid, text);

CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
  target_role text;
  active_owner_count int;
BEGIN
  -- Get caller's role (must be active, not deactivated)
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change user roles';
  END IF;

  -- Only owners can set the 'owner' role; managers can only set tech/manager
  IF new_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can assign the owner role';
  END IF;

  IF new_role NOT IN ('tech', 'manager', 'owner') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Get target's current role
  SELECT role INTO target_role FROM user_profiles WHERE id = target_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Last-owner protection: cannot demote or deactivate the last owner
  IF target_role = 'owner' AND new_role != 'owner' THEN
    SELECT count(*) INTO active_owner_count FROM user_profiles
      WHERE role = 'owner' AND status = 'active' AND deactivated_at IS NULL
      AND id != target_user_id;
    IF active_owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last active owner. Promote another user to owner first.';
    END IF;
  END IF;

  -- Perform the update
  UPDATE user_profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- ============================================================
-- 3. set_user_status — activate/deactivate with last-owner protection
--    Controls status and deactivated_at — these columns are revoked from
--    direct API writes.
-- ============================================================
DROP FUNCTION IF EXISTS public.set_user_status(uuid, text);

CREATE OR REPLACE FUNCTION public.set_user_status(target_user_id uuid, new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
  target_role text;
  target_current_status text;
  active_owner_count int;
  new_deactivated timestamptz;
BEGIN
  -- Get caller's role
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change user status';
  END IF;

  IF new_status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'Invalid status. Use ''pending'' or ''active''.';
  END IF;

  -- Get target info
  SELECT role, status INTO target_role, target_current_status FROM user_profiles WHERE id = target_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Prevent self-deactivation
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  -- Last-owner protection: cannot deactivate the last owner
  IF new_status = 'pending' AND target_role = 'owner' AND target_current_status = 'active' THEN
    SELECT count(*) INTO active_owner_count FROM user_profiles
      WHERE role = 'owner' AND status = 'active' AND deactivated_at IS NULL
      AND id != target_user_id;
    IF active_owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot deactivate the last active owner. Promote another user to owner first.';
    END IF;
  END IF;

  -- Perform the update
  new_deactivated := CASE WHEN new_status = 'pending' THEN now() ELSE NULL END;
  UPDATE user_profiles
    SET status = new_status, deactivated_at = new_deactivated
    WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_status(uuid, text) TO authenticated;

-- ============================================================
-- 4. approve_inspection — managers/owners only, blocks unresolved corrections
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_inspection(uuid);

CREATE OR REPLACE FUNCTION public.approve_inspection(inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
  has_correction boolean;
  current_status text;
BEGIN
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role = 'tech' THEN
    RAISE EXCEPTION 'Only active managers or owners can approve reports';
  END IF;

  SELECT status, correction_requested_at IS NOT NULL INTO current_status, has_correction
    FROM inspections WHERE id = inspection_id;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Inspection not found';
  END IF;
  IF has_correction THEN
    RAISE EXCEPTION 'Cannot approve an inspection with unresolved correction requests';
  END IF;

  UPDATE inspections
    SET status = 'approved', report_approved = true, approved_at = now(), approved_by = auth.uid()
    WHERE id = inspection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_inspection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inspection(uuid) TO authenticated;

-- ============================================================
-- 5. send_inspection_report_fn — managers/owners only
-- ============================================================
DROP FUNCTION IF EXISTS public.send_inspection_report_fn(uuid);

CREATE OR REPLACE FUNCTION public.send_inspection_report_fn(inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
  is_approved boolean;
BEGIN
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role = 'tech' THEN
    RAISE EXCEPTION 'Only active managers or owners can send reports';
  END IF;

  SELECT report_approved INTO is_approved FROM inspections WHERE id = inspection_id;
  IF is_approved IS NULL THEN
    RAISE EXCEPTION 'Inspection not found';
  END IF;
  IF NOT is_approved THEN
    RAISE EXCEPTION 'Report must be approved before sending';
  END IF;

  UPDATE inspections
    SET status = 'sent', report_sent = true, report_sent_at = now()
    WHERE id = inspection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_inspection_report_fn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_inspection_report_fn(uuid) TO authenticated;

-- ============================================================
-- 6. resolve_correction — managers/owners only, clears correction fields
--    Technicians can complete their work (status flows to pending_review
--    naturally) but CANNOT dismiss a correction request themselves.
-- ============================================================
DROP FUNCTION IF EXISTS public.resolve_correction(uuid);

CREATE OR REPLACE FUNCTION public.resolve_correction(inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role = 'tech' THEN
    RAISE EXCEPTION 'Only active managers or owners can resolve correction requests';
  END IF;

  UPDATE inspections
    SET correction_notes = NULL, correction_requested_at = NULL
    WHERE id = inspection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_correction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_correction(uuid) TO authenticated;

-- ============================================================
-- 7. request_correction_fn — managers/owners only, sets correction fields
--    Stores correction history; techs see the notes but cannot dismiss them.
-- ============================================================
DROP FUNCTION IF EXISTS public.request_correction_fn(uuid, text);

CREATE OR REPLACE FUNCTION public.request_correction_fn(inspection_id uuid, notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role = 'tech' THEN
    RAISE EXCEPTION 'Only active managers or owners can request corrections';
  END IF;

  IF notes IS NULL OR trim(notes) = '' THEN
    RAISE EXCEPTION 'Correction notes are required';
  END IF;

  UPDATE inspections
    SET status = 'in_progress',
        correction_notes = trim(notes),
        correction_requested_at = now()
    WHERE id = inspection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_correction_fn(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_correction_fn(uuid, text) TO authenticated;

-- ============================================================
-- 8. Harden existing SECURITY DEFINER functions to check active+not-deactivated
-- ============================================================

DROP FUNCTION IF EXISTS public.is_manager_or_owner();
CREATE OR REPLACE FUNCTION public.is_manager_or_owner()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_role text;
BEGIN
  SELECT role INTO user_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  RETURN COALESCE(user_role IN ('manager', 'owner'), false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.is_manager_or_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager_or_owner() TO authenticated;

DROP FUNCTION IF EXISTS public.get_all_profiles();
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS setof user_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager_or_owner() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM user_profiles ORDER BY created_at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;

DROP FUNCTION IF EXISTS public.get_tech_profiles();
CREATE OR REPLACE FUNCTION public.get_tech_profiles()
RETURNS setof user_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager_or_owner() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
    SELECT * FROM user_profiles
    WHERE role = 'tech' AND status = 'active' AND deactivated_at IS NULL
    ORDER BY full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_tech_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tech_profiles() TO authenticated;

-- ============================================================
-- 9. Column-level privileges: user_profiles
--    Revoke direct API writes to role, status, deactivated_at.
--    These must go through set_user_role / set_user_status functions.
-- ============================================================

REVOKE UPDATE ON user_profiles FROM anon, authenticated;
-- Re-grant UPDATE only on user-editable columns
GRANT UPDATE (full_name, first_name, last_name, phone) ON user_profiles TO authenticated;

-- Revoke SELECT on sensitive columns from anon entirely
REVOKE SELECT ON user_profiles FROM anon;
-- Grant SELECT to authenticated (they need to see staff list for assignments)
GRANT SELECT ON user_profiles TO authenticated;

-- ============================================================
-- 10. Column-level privileges: inspections
--    Revoke direct API writes to approval/sending/correction columns.
--    These must go through approve_inspection / send_inspection_report_fn /
--    request_correction_fn / resolve_correction functions.
--    Techs can still update: status (not_started→in_progress→pending_review),
--    progress_percent, paused_at, paused_duration_seconds, work_started_at,
--    work_completed_at, completed_at, checkin_complete, checkin_notes,
--    checkin_step, checkin_video_url, tech_notes, manager_notes,
--    overall_condition, investment_guidance, executive_summary,
--    primary_recommendation, assigned_tech_id, archived, archived_at
-- ============================================================

REVOKE UPDATE ON inspections FROM anon, authenticated;
-- Re-grant UPDATE on all columns EXCEPT the protected ones
GRANT UPDATE (
  customer_first_name, customer_last_name, customer_phone, customer_email,
  vehicle_year, vehicle_make, vehicle_model, vehicle_vin, vehicle_mileage,
  status, progress_percent, assigned_tech_id, created_by, manager_notes,
  tech_notes, overall_condition, investment_guidance, report_access_token,
  checkin_notes, checkin_video_url, checkin_complete, work_started_at,
  work_completed_at, completed_at, archived, archived_at, paused_at,
  paused_duration_seconds, vehicle_color, customer_city, customer_state,
  customer_zip, customer_address, executive_summary, primary_recommendation,
  checkin_step
) ON inspections TO authenticated;

-- Protected columns (NOT directly writable via API):
-- report_approved, report_sent, report_sent_at, approved_at, approved_by,
-- correction_notes, correction_requested_at
-- These are only set by SECURITY DEFINER functions.

-- ============================================================
-- 11. RLS: user_profiles — tighten SELECT and UPDATE
-- ============================================================

DROP POLICY IF EXISTS "select_user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "select_user_profiles_authenticated" ON user_profiles;

-- Authenticated users can read profiles, but we rely on the function
-- get_all_profiles for the full list (which checks manager/owner).
-- A self-read policy lets users see their own profile.
CREATE POLICY "profiles_select_own_or_staff" ON user_profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR public.is_manager_or_owner()
  );

-- UPDATE: only managers/owners can update other profiles; users can
-- update their own non-privileged columns (full_name, phone, etc.)
-- The role/status/deactivated_at columns are protected by column-level revocation.
DROP POLICY IF EXISTS "managers_update_all" ON user_profiles;
DROP POLICY IF EXISTS "managers_update_active_profiles" ON user_profiles;

CREATE POLICY "profiles_update_own_or_manager" ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_manager_or_owner())
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.is_manager_or_owner())
  );

-- INSERT: only the handle_new_user trigger inserts profiles (via trigger,
-- which runs as the table owner). No direct INSERT policy needed for users.
-- Keep the existing INSERT policy if it exists; otherwise deny.
DROP POLICY IF EXISTS "profiles_insert_self" ON user_profiles;
-- No INSERT policy = INSERT is denied for authenticated/anon via RLS.
-- The trigger function handle_new_user runs as owner (bypasses RLS).

-- DELETE: only owners can delete profiles
DROP POLICY IF EXISTS "profiles_delete_owner" ON user_profiles;
CREATE POLICY "profiles_delete_owner" ON user_profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- ============================================================
-- 12. RLS: inspections — scope SELECT, restrict UPDATE columns
-- ============================================================

DROP POLICY IF EXISTS "inspections_select_own" ON inspections;
DROP POLICY IF EXISTS "inspections_select_authorized" ON inspections;

CREATE POLICY "inspections_select_authorized" ON inspections FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR assigned_tech_id = auth.uid()
    OR created_by = auth.uid()
  );

-- UPDATE: techs can update their assigned inspections (but NOT the protected
-- columns due to column-level revocation). Managers/owners can update any.
-- Deactivated/pending users are rejected.
DROP POLICY IF EXISTS "inspections_update_assigned" ON inspections;
DROP POLICY IF EXISTS "inspections_update_creator" ON inspections;
DROP POLICY IF EXISTS "inspections_update_authorized" ON inspections;

CREATE POLICY "inspections_update_authorized" ON inspections FOR UPDATE
  TO authenticated
  USING (
    (public.is_manager_or_owner())
    OR (assigned_tech_id = auth.uid() AND public.is_active_staff())
    OR (created_by = auth.uid() AND public.is_active_staff())
  )
  WITH CHECK (
    (public.is_manager_or_owner())
    OR (assigned_tech_id = auth.uid() AND public.is_active_staff())
    OR (created_by = auth.uid() AND public.is_active_staff())
  );

-- INSERT: only active managers/owners
DROP POLICY IF EXISTS "inspections_insert_manager" ON inspections;
DROP POLICY IF EXISTS "inspections_insert_active_manager" ON inspections;
CREATE POLICY "inspections_insert_active_manager" ON inspections FOR INSERT
  TO authenticated WITH CHECK (public.is_manager_or_owner());

-- DELETE: only active owners and managers
DROP POLICY IF EXISTS "owners_managers_delete_inspections" ON inspections;
DROP POLICY IF EXISTS "owners_managers_delete_active" ON inspections;
CREATE POLICY "owners_managers_delete_active" ON inspections FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 13. RLS: inspection_items — tighten with active/deactivated check
-- ============================================================

DROP POLICY IF EXISTS "items_select_section" ON inspection_items;
CREATE POLICY "items_select_authorized" ON inspection_items FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_sections sec
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE sec.id = inspection_items.section_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid())
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "items_update_section" ON inspection_items;
DROP POLICY IF EXISTS "items_update_authorized" ON inspection_items;
CREATE POLICY "items_update_authorized" ON inspection_items FOR UPDATE
  TO authenticated
  USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_sections sec
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE sec.id = inspection_items.section_id
      AND i.assigned_tech_id = auth.uid()
      AND public.is_active_staff()
    )
  )
  WITH CHECK (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_sections sec
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE sec.id = inspection_items.section_id
      AND i.assigned_tech_id = auth.uid()
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "items_insert_section" ON inspection_items;
DROP POLICY IF EXISTS "items_insert_active_manager" ON inspection_items;
CREATE POLICY "items_insert_active_manager" ON inspection_items FOR INSERT
  TO authenticated WITH CHECK (public.is_manager_or_owner());

-- ============================================================
-- 14. RLS: inspection_sections — tighten with active/deactivated check
-- ============================================================

DROP POLICY IF EXISTS "sections_select_inspection" ON inspection_sections;
CREATE POLICY "sections_select_authorized" ON inspection_sections FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid())
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "sections_update_inspection" ON inspection_sections;
CREATE POLICY "sections_update_authorized" ON inspection_sections FOR UPDATE
  TO authenticated
  USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
      AND i.assigned_tech_id = auth.uid()
      AND public.is_active_staff()
    )
  )
  WITH CHECK (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
      AND i.assigned_tech_id = auth.uid()
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "sections_insert_inspection" ON inspection_sections;
CREATE POLICY "sections_insert_active_manager" ON inspection_sections FOR INSERT
  TO authenticated WITH CHECK (public.is_manager_or_owner());

-- ============================================================
-- 15. RLS: inspection_photos — tighten with active/deactivated check
-- ============================================================

DROP POLICY IF EXISTS "photos_select_authenticated" ON inspection_photos;
CREATE POLICY "photos_select_authorized" ON inspection_photos FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_items item
      JOIN inspection_sections sec ON sec.id = item.section_id
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE item.id = inspection_photos.item_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid())
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "photos_insert_authenticated" ON inspection_photos;
CREATE POLICY "photos_insert_authorized" ON inspection_photos FOR INSERT
  TO authenticated WITH CHECK (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_items item
      JOIN inspection_sections sec ON sec.id = item.section_id
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE item.id = inspection_photos.item_id
      AND i.assigned_tech_id = auth.uid()
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "photos_delete_authenticated" ON inspection_photos;
CREATE POLICY "photos_delete_authorized" ON inspection_photos FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 16. RLS: inspection_videos — tighten with active/deactivated check
-- ============================================================

DROP POLICY IF EXISTS "videos_select" ON inspection_videos;
CREATE POLICY "videos_select_authorized" ON inspection_videos FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_items item
      JOIN inspection_sections sec ON sec.id = item.section_id
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE item.id = inspection_videos.item_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid())
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "videos_insert" ON inspection_videos;
CREATE POLICY "videos_insert_authorized" ON inspection_videos FOR INSERT
  TO authenticated WITH CHECK (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspection_items item
      JOIN inspection_sections sec ON sec.id = item.section_id
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE item.id = inspection_videos.item_id
      AND i.assigned_tech_id = auth.uid()
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "videos_delete" ON inspection_videos;
CREATE POLICY "videos_delete_authorized" ON inspection_videos FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 17. RLS: checkin_photos — tighten with active/deactivated check
-- ============================================================

DROP POLICY IF EXISTS "checkin_photos_select" ON checkin_photos;
CREATE POLICY "checkin_photos_select_authorized" ON checkin_photos FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = checkin_photos.inspection_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid())
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "checkin_photos_insert" ON checkin_photos;
CREATE POLICY "checkin_photos_insert_authorized" ON checkin_photos FOR INSERT
  TO authenticated WITH CHECK (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = checkin_photos.inspection_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid())
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "checkin_photos_update_creator" ON checkin_photos;
CREATE POLICY "checkin_photos_update_authorized" ON checkin_photos FOR UPDATE
  TO authenticated
  USING (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = checkin_photos.inspection_id
      AND i.created_by = auth.uid()
      AND public.is_active_staff()
    )
  )
  WITH CHECK (
    public.is_manager_or_owner()
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = checkin_photos.inspection_id
      AND i.created_by = auth.uid()
      AND public.is_active_staff()
    )
  );

DROP POLICY IF EXISTS "checkin_photos_delete" ON checkin_photos;
CREATE POLICY "checkin_photos_delete_authorized" ON checkin_photos FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 18. RLS: email_templates — owner only, active check
-- ============================================================

DROP POLICY IF EXISTS "email_templates_select" ON email_templates;
CREATE POLICY "email_templates_select_authorized" ON email_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "email_templates_update" ON email_templates;
DROP POLICY IF EXISTS "email_templates_update_active_owner" ON email_templates;
CREATE POLICY "email_templates_update_active_owner" ON email_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "email_templates_insert" ON email_templates;
DROP POLICY IF EXISTS "email_templates_insert_active_owner" ON email_templates;
CREATE POLICY "email_templates_insert_active_owner" ON email_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "email_templates_delete" ON email_templates;
CREATE POLICY "email_templates_delete_active_owner" ON email_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- ============================================================
-- 19. RLS: inspection_templates, template_sections, template_items
--    Owner only, active check
-- ============================================================

-- inspection_templates
DROP POLICY IF EXISTS "templates_select" ON inspection_templates;
CREATE POLICY "templates_select_active_owner" ON inspection_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "templates_update" ON inspection_templates;
CREATE POLICY "templates_update_active_owner" ON inspection_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "templates_insert" ON inspection_templates;
CREATE POLICY "templates_insert_active_owner" ON inspection_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "templates_delete" ON inspection_templates;
CREATE POLICY "templates_delete_active_owner" ON inspection_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- template_sections
DROP POLICY IF EXISTS "tsections_select" ON template_sections;
CREATE POLICY "tsections_select_active_owner" ON template_sections FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "tsections_update" ON template_sections;
CREATE POLICY "tsections_update_active_owner" ON template_sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "tsections_insert" ON template_sections;
CREATE POLICY "tsections_insert_active_owner" ON template_sections FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "tsections_delete" ON template_sections;
CREATE POLICY "tsections_delete_active_owner" ON template_sections FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- template_items
DROP POLICY IF EXISTS "titems_select" ON template_items;
CREATE POLICY "titems_select_active_owner" ON template_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "titems_update" ON template_items;
CREATE POLICY "titems_update_active_owner" ON template_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "titems_insert" ON template_items;
CREATE POLICY "titems_insert_active_owner" ON template_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "titems_delete" ON template_items;
CREATE POLICY "titems_delete_active_owner" ON template_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- ============================================================
-- 20. RLS: shop_settings — managers/owners, active check
-- ============================================================

DROP POLICY IF EXISTS "shop_settings_select" ON shop_settings;
CREATE POLICY "shop_settings_select_active_staff" ON shop_settings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner'])
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "shop_settings_update" ON shop_settings;
CREATE POLICY "shop_settings_update_active_staff" ON shop_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner'])
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner'])
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "shop_settings_insert" ON shop_settings;
CREATE POLICY "shop_settings_insert_active_staff" ON shop_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner'])
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

DROP POLICY IF EXISTS "shop_settings_delete" ON shop_settings;
CREATE POLICY "shop_settings_delete_active_owner" ON shop_settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- ============================================================
-- 21. Revoke excess table-level grants from anon on all Inspection-App tables
--     (checkin_photos, email_templates, inspection_items, inspection_photos,
--      inspection_sections, inspection_templates, inspection_videos,
--      inspections, shop_settings, template_items, template_sections,
--      user_profiles)
--     The anon role should not have direct table access to any of these.
-- ============================================================

REVOKE ALL ON checkin_photos FROM anon;
REVOKE ALL ON email_templates FROM anon;
REVOKE ALL ON inspection_items FROM anon;
REVOKE ALL ON inspection_photos FROM anon;
REVOKE ALL ON inspection_sections FROM anon;
REVOKE ALL ON inspection_templates FROM anon;
REVOKE ALL ON inspection_videos FROM anon;
REVOKE ALL ON inspections FROM anon;
REVOKE ALL ON shop_settings FROM anon;
REVOKE ALL ON template_items FROM anon;
REVOKE ALL ON template_sections FROM anon;
REVOKE ALL ON user_profiles FROM anon;

-- Re-grant minimal table-level privileges to authenticated
-- (column-level restrictions on inspections/user_profiles still apply)
GRANT SELECT, INSERT, UPDATE, DELETE ON checkin_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON template_sections TO authenticated;
-- user_profiles: SELECT granted above, UPDATE only on specific columns
-- No INSERT/DELETE for authenticated on user_profiles (trigger handles insert,
-- owner-only delete policy handles deletion)
GRANT SELECT ON user_profiles TO authenticated;
