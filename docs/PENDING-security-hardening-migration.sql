/*
# Security Hardening Migration — PENDING APPROVAL

## WARNING: This migration has NOT been applied to production.
Do not apply without explicit authorization from the project owner.
Once approved, apply via the Supabase MCP apply_migration tool.

## Security Issues Fixed
1. Deactivated users can still access data (no deactivated_at check in RLS)
2. Pending users can access protected data (no status='active' check in most policies)
3. No last-owner protection at DB level
4. Technicians can set inspection status to approved/sent via direct API
5. user_profiles SELECT open to public role
6. Inspections SELECT uses USING(true) — all authenticated users see all inspections

## Changes
- All RLS policies now check status='active' AND deactivated_at IS NULL
- New SECURITY DEFINER functions: can_modify_role, approve_inspection, send_inspection_report_fn
- user_profiles SELECT restricted to authenticated only
- Inspections SELECT scoped to assigned tech / creator / manager+owner
- Inspection status transitions to approved/sent require manager/owner role
*/

-- Full SQL below — apply when authorized:

-- 1. Helper: can_modify_role(target_user_id, new_role) — last-owner protection
DROP FUNCTION IF EXISTS public.can_modify_role(uuid, text);
CREATE OR REPLACE FUNCTION public.can_modify_role(target_user_id uuid, new_role text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE active_owner_count int; target_current_role text;
BEGIN
  SELECT role INTO target_current_role FROM user_profiles WHERE id = target_user_id;
  IF target_current_role IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO active_owner_count FROM user_profiles
  WHERE role = 'owner' AND status = 'active' AND deactivated_at IS NULL AND id != target_user_id;
  IF target_current_role = 'owner' AND new_role != 'owner' AND active_owner_count = 0 THEN
    RETURN false;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.can_modify_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_modify_role(uuid, text) TO authenticated;

-- 2. approve_inspection(inspection_id) — managers/owners only, blocks unresolved corrections
DROP FUNCTION IF EXISTS public.approve_inspection(uuid);
CREATE OR REPLACE FUNCTION public.approve_inspection(inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role text; caller_status text; caller_deactivated timestamptz; has_correction boolean;
BEGIN
  SELECT role, status, deactivated_at INTO caller_role, caller_status, caller_deactivated
  FROM user_profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role = 'tech' OR caller_status != 'active' OR caller_deactivated IS NOT NULL THEN
    RAISE EXCEPTION 'Only active managers or owners can approve reports';
  END IF;
  SELECT correction_requested_at IS NOT NULL INTO has_correction FROM inspections WHERE id = inspection_id;
  IF has_correction THEN
    RAISE EXCEPTION 'Cannot approve an inspection with unresolved correction requests';
  END IF;
  UPDATE inspections SET status = 'approved', report_approved = true, approved_at = now(), approved_by = auth.uid()
  WHERE id = inspection_id;
END; $$;
REVOKE ALL ON FUNCTION public.approve_inspection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inspection(uuid) TO authenticated;

-- 3. send_inspection_report_fn(inspection_id) — managers/owners only
DROP FUNCTION IF EXISTS public.send_inspection_report_fn(uuid);
CREATE OR REPLACE FUNCTION public.send_inspection_report_fn(inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role text; caller_status text; caller_deactivated timestamptz;
BEGIN
  SELECT role, status, deactivated_at INTO caller_role, caller_status, caller_deactivated
  FROM user_profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role = 'tech' OR caller_status != 'active' OR caller_deactivated IS NOT NULL THEN
    RAISE EXCEPTION 'Only active managers or owners can send reports';
  END IF;
  UPDATE inspections SET status = 'sent', report_sent = true, report_sent_at = now()
  WHERE id = inspection_id AND report_approved = true;
END; $$;
REVOKE ALL ON FUNCTION public.send_inspection_report_fn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_inspection_report_fn(uuid) TO authenticated;

-- 4. Tighten user_profiles SELECT — authenticated only
REVOKE SELECT ON user_profiles FROM anon;
DROP POLICY IF EXISTS "select_user_profiles" ON user_profiles;
CREATE POLICY "select_user_profiles_authenticated" ON user_profiles FOR SELECT
TO authenticated USING (true);

-- 5. Tighten user_profiles UPDATE — add deactivation check
DROP POLICY IF EXISTS "managers_update_all" ON user_profiles;
CREATE POLICY "managers_update_active_profiles" ON user_profiles FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL));

-- 6. Tighten inspections SELECT — scope to authorized users
DROP POLICY IF EXISTS "inspections_select_own" ON inspections;
CREATE POLICY "inspections_select_authorized" ON inspections FOR SELECT
TO authenticated USING (
  (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL))
  OR assigned_tech_id = auth.uid()
  OR created_by = auth.uid()
);

-- 7. Tighten inspections UPDATE — add active/deactivation check
DROP POLICY IF EXISTS "inspections_update_assigned" ON inspections;
DROP POLICY IF EXISTS "inspections_update_creator" ON inspections;
CREATE POLICY "inspections_update_authorized" ON inspections FOR UPDATE
TO authenticated
USING (
  (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL))
  OR (assigned_tech_id = auth.uid() AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.status = 'active' AND up.deactivated_at IS NULL))
  OR (created_by = auth.uid() AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.status = 'active' AND up.deactivated_at IS NULL))
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL))
  OR (assigned_tech_id = auth.uid() AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.status = 'active' AND up.deactivated_at IS NULL))
  OR (created_by = auth.uid() AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.status = 'active' AND up.deactivated_at IS NULL))
);

-- 8. Tighten inspections INSERT/DELETE
DROP POLICY IF EXISTS "inspections_insert_manager" ON inspections;
CREATE POLICY "inspections_insert_active_manager" ON inspections FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL)
);
DROP POLICY IF EXISTS "owners_managers_delete_inspections" ON inspections;
CREATE POLICY "owners_managers_delete_active" ON inspections FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['owner','manager']) AND up.status = 'active' AND up.deactivated_at IS NULL)
);

-- 9. Tighten inspection_items UPDATE/INSERT — add active/deactivation check
DROP POLICY IF EXISTS "items_update_section" ON inspection_items;
CREATE POLICY "items_update_authorized" ON inspection_items FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM inspection_sections sec JOIN inspections i ON i.id = sec.inspection_id WHERE sec.id = inspection_items.section_id AND ((i.assigned_tech_id = auth.uid() AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.status = 'active' AND up.deactivated_at IS NULL)) OR (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL)))))
WITH CHECK (EXISTS (SELECT 1 FROM inspection_sections sec JOIN inspections i ON i.id = sec.inspection_id WHERE sec.id = inspection_items.section_id AND ((i.assigned_tech_id = auth.uid() AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.status = 'active' AND up.deactivated_at IS NULL)) OR (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL)))));

DROP POLICY IF EXISTS "items_insert_section" ON inspection_items;
CREATE POLICY "items_insert_active_manager" ON inspection_items FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['manager','owner']) AND up.status = 'active' AND up.deactivated_at IS NULL)
);

-- 10. Tighten email_templates — owner only, active check
DROP POLICY IF EXISTS "email_templates_update" ON email_templates;
CREATE POLICY "email_templates_update_active_owner" ON email_templates FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL))
WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL));

DROP POLICY IF EXISTS "email_templates_insert" ON email_templates;
CREATE POLICY "email_templates_insert_active_owner" ON email_templates FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'owner' AND up.status = 'active' AND up.deactivated_at IS NULL)
);
