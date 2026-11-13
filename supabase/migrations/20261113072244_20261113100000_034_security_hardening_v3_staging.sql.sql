/*
# Security Hardening Migration v3 — STAGING TEST APPLY

## Purpose
Apply the pending v3 security hardening migration to the staging database
for real permission testing. This is NOT a production deployment.

## Changes
- Creates SECURITY DEFINER functions: is_active_staff, get_caller_role,
  set_user_role, set_user_status, approve_inspection, send_inspection_report_fn,
  resolve_correction, request_correction_fn
- Hardens existing functions: is_manager_or_owner, get_all_profiles, get_tech_profiles
- Column-level privileges on inspections (no table-level UPDATE)
- Column-level privileges on user_profiles (REVOKE ALL, selective re-grant)
- Drops ALL existing policies on 12 affected tables via DO block
- Creates new restrictive RLS policies with active/deactivated checks
- Revokes anon access on all inspection-app tables
- Does NOT touch any hub_* tables
*/

-- ============================================================
-- 1. Helper functions for active caller check
-- ============================================================

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
-- 2. set_user_role
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
  PERFORM pg_advisory_xact_lock(987654321);
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change user roles';
  END IF;
  IF new_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can assign the owner role';
  END IF;
  IF new_role NOT IN ('tech', 'manager', 'owner') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  SELECT role INTO target_role FROM user_profiles WHERE id = target_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  IF target_role = 'owner' AND new_role != 'owner' THEN
    SELECT count(*) INTO active_owner_count FROM user_profiles
      WHERE role = 'owner' AND status = 'active' AND deactivated_at IS NULL
      AND id != target_user_id;
    IF active_owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last active owner. Promote another user to owner first.';
    END IF;
  END IF;
  UPDATE user_profiles SET role = new_role WHERE id = target_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- ============================================================
-- 3. set_user_status
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
  PERFORM pg_advisory_xact_lock(987654321);
  SELECT role INTO caller_role FROM user_profiles
    WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only managers or owners can change user status';
  END IF;
  IF new_status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'Invalid status. Use ''pending'' or ''active''.';
  END IF;
  SELECT role, status INTO target_role, target_current_status FROM user_profiles WHERE id = target_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;
  IF new_status = 'pending' AND target_role = 'owner' AND target_current_status = 'active' THEN
    SELECT count(*) INTO active_owner_count FROM user_profiles
      WHERE role = 'owner' AND status = 'active' AND deactivated_at IS NULL
      AND id != target_user_id;
    IF active_owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot deactivate the last active owner. Promote another user to owner first.';
    END IF;
  END IF;
  new_deactivated := CASE WHEN new_status = 'pending' THEN now() ELSE NULL END;
  UPDATE user_profiles
    SET status = new_status, deactivated_at = new_deactivated
    WHERE id = target_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_status(uuid, text) TO authenticated;

-- ============================================================
-- 4. approve_inspection
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
-- 5. send_inspection_report_fn
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
-- 6. resolve_correction
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
-- 7. request_correction_fn
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
-- 8. Harden existing SECURITY DEFINER functions
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
-- ============================================================

REVOKE ALL ON user_profiles FROM anon, authenticated;
GRANT SELECT ON user_profiles TO authenticated;
GRANT UPDATE (full_name, first_name, last_name, phone) ON user_profiles TO authenticated;

-- ============================================================
-- 10. Column-level privileges: inspections
-- ============================================================

REVOKE UPDATE ON inspections FROM anon, authenticated;
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

-- ============================================================
-- 10a. Drop ALL existing policies on affected tables
-- ============================================================

DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'user_profiles', 'inspections', 'inspection_items',
        'inspection_sections', 'inspection_photos', 'inspection_videos',
        'checkin_photos', 'email_templates', 'inspection_templates',
        'template_sections', 'template_items', 'shop_settings'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- 11. RLS: user_profiles
-- ============================================================

CREATE POLICY "profiles_select_own_or_staff" ON user_profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR public.is_manager_or_owner()
  );

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

CREATE POLICY "profiles_delete_owner" ON user_profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
    AND NOT (
      user_profiles.role = 'owner'
      AND user_profiles.status = 'active'
      AND user_profiles.deactivated_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.role = 'owner' AND up.status = 'active'
        AND up.deactivated_at IS NULL
        AND up.id != user_profiles.id
      )
    )
  );

-- ============================================================
-- 12. RLS: inspections
-- ============================================================

CREATE POLICY "inspections_select_authorized" ON inspections FOR SELECT
  TO authenticated USING (
    public.is_manager_or_owner()
    OR (assigned_tech_id = auth.uid() AND public.is_active_staff())
    OR (created_by = auth.uid() AND public.is_active_staff())
  );

CREATE POLICY "inspections_update_authorized" ON inspections FOR UPDATE
  TO authenticated
  USING (
    (public.is_manager_or_owner())
    OR (assigned_tech_id = auth.uid() AND public.is_active_staff())
    OR (created_by = auth.uid() AND public.is_active_staff())
  )
  WITH CHECK (
    (public.is_manager_or_owner())
    OR (assigned_tech_id = auth.uid() AND public.is_active_staff()
        AND status NOT IN ('approved', 'sent'))
    OR (created_by = auth.uid() AND public.is_active_staff()
        AND status NOT IN ('approved', 'sent'))
  );

CREATE POLICY "inspections_insert_active_manager" ON inspections FOR INSERT
  TO authenticated WITH CHECK (public.is_manager_or_owner());

CREATE POLICY "owners_managers_delete_active" ON inspections FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 13. RLS: inspection_items
-- ============================================================

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

CREATE POLICY "items_insert_active_manager" ON inspection_items FOR INSERT
  TO authenticated WITH CHECK (public.is_manager_or_owner());

-- ============================================================
-- 14. RLS: inspection_sections
-- ============================================================

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

CREATE POLICY "sections_insert_active_manager" ON inspection_sections FOR INSERT
  TO authenticated WITH CHECK (public.is_manager_or_owner());

-- ============================================================
-- 15. RLS: inspection_photos
-- ============================================================

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

CREATE POLICY "photos_delete_authorized" ON inspection_photos FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 16. RLS: inspection_videos
-- ============================================================

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

CREATE POLICY "videos_delete_authorized" ON inspection_videos FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 17. RLS: checkin_photos
-- ============================================================

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

CREATE POLICY "checkin_photos_delete_authorized" ON checkin_photos FOR DELETE
  TO authenticated USING (public.is_manager_or_owner());

-- ============================================================
-- 18. RLS: email_templates — owner only
-- ============================================================

CREATE POLICY "email_templates_select_authorized" ON email_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

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

CREATE POLICY "email_templates_insert_active_owner" ON email_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

CREATE POLICY "email_templates_delete_active_owner" ON email_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );

-- ============================================================
-- 19. RLS: inspection_templates, template_sections, template_items
-- ============================================================

CREATE POLICY "templates_select_active_owner" ON inspection_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'owner'
      AND up.status = 'active' AND up.deactivated_at IS NULL)
  );
CREATE POLICY "templates_update_active_owner" ON inspection_templates FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "templates_insert_active_owner" ON inspection_templates FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "templates_delete_active_owner" ON inspection_templates FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));

CREATE POLICY "tsections_select_active_owner" ON template_sections FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "tsections_update_active_owner" ON template_sections FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "tsections_insert_active_owner" ON template_sections FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "tsections_delete_active_owner" ON template_sections FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));

CREATE POLICY "titems_select_active_owner" ON template_items FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "titems_update_active_owner" ON template_items FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "titems_insert_active_owner" ON template_items FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "titems_delete_active_owner" ON template_items FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));

-- ============================================================
-- 20. RLS: shop_settings
-- ============================================================

CREATE POLICY "shop_settings_select_active_staff" ON shop_settings FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "shop_settings_update_active_staff" ON shop_settings FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "shop_settings_insert_active_staff" ON shop_settings FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL));
CREATE POLICY "shop_settings_delete_active_owner" ON shop_settings FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));

-- ============================================================
-- 21. Final table-level grants
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

GRANT SELECT, INSERT, DELETE ON inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON checkin_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON template_sections TO authenticated;

REVOKE ALL ON user_profiles FROM authenticated;
GRANT SELECT ON user_profiles TO authenticated;
GRANT UPDATE (full_name, first_name, last_name, phone) ON user_profiles TO authenticated;
