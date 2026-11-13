/*
# Fix: Manager-only column protection on inspections

## Problem
The v3 migration granted UPDATE on manager-only columns (manager_notes, executive_summary,
primary_recommendation, report_access_token, overall_condition, investment_guidance,
archived, archived_at) to ALL authenticated users. RLS policies allow techs to UPDATE
inspections they're assigned to, so a technician could directly modify manager-only
fields via the Data API — confirmed in staging testing.

## Fix
1. REVOKE UPDATE on manager-only columns from authenticated
2. Create save_manager_review() SECURITY DEFINER RPC for manager/owner review saves
3. Create archive_inspection() SECURITY DEFINER RPC for archiving
4. Re-grant UPDATE only on columns techs legitimately need

## Columns removed from authenticated UPDATE:
- manager_notes, executive_summary, primary_recommendation (manager review content)
- report_access_token (auto-generated, never written by app)
- overall_condition, investment_guidance (manager assessment)
- archived, archived_at (manager/owner archive action)

## Columns kept in authenticated UPDATE:
- status, progress_percent, tech_notes, checkin_*, work_*, completed_at
- vehicle_*, customer_* (check-in data entry)
- assigned_tech_id, created_by (protected by RLS WITH CHECK)
- paused_at, paused_duration_seconds

## Security
- save_manager_review: SECURITY DEFINER, checks get_caller_role() IN ('manager','owner')
- archive_inspection: SECURITY DEFINER, checks get_caller_role() IN ('manager','owner')
- Both REVOKE EXECUTE FROM PUBLIC, anon; GRANT TO authenticated
*/

-- 1. Revoke all current column-level UPDATE grants on inspections
REVOKE UPDATE ON inspections FROM anon, authenticated;

-- 2. Re-grant UPDATE only on tech-safe columns
GRANT UPDATE (
  status,
  progress_percent,
  assigned_tech_id,
  created_by,
  tech_notes,
  checkin_notes,
  checkin_video_url,
  checkin_complete,
  checkin_step,
  work_started_at,
  work_completed_at,
  completed_at,
  paused_at,
  paused_duration_seconds,
  vehicle_color,
  vehicle_year,
  vehicle_make,
  vehicle_model,
  vehicle_vin,
  vehicle_mileage,
  customer_first_name,
  customer_last_name,
  customer_phone,
  customer_email,
  customer_address,
  customer_city,
  customer_state,
  customer_zip
) ON inspections TO authenticated;

-- 3. Create save_manager_review RPC
CREATE OR REPLACE FUNCTION public.save_manager_review(
  p_inspection_id uuid,
  p_overall_condition text DEFAULT NULL,
  p_investment_guidance text DEFAULT NULL,
  p_manager_notes text DEFAULT NULL,
  p_executive_summary text DEFAULT NULL,
  p_primary_recommendation text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM user_profiles
  WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only active managers or owners can save review content';
  END IF;
  UPDATE inspections
  SET
    overall_condition = p_overall_condition,
    investment_guidance = p_investment_guidance,
    manager_notes = p_manager_notes,
    executive_summary = p_executive_summary,
    primary_recommendation = p_primary_recommendation
  WHERE id = p_inspection_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_manager_review(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manager_review(uuid, text, text, text, text, text) TO authenticated;

-- 4. Create archive_inspection RPC
CREATE OR REPLACE FUNCTION public.archive_inspection(
  p_inspection_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  current_status text;
BEGIN
  SELECT role INTO caller_role FROM user_profiles
  WHERE id = auth.uid() AND status = 'active' AND deactivated_at IS NULL;
  IF caller_role IS NULL OR caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Only active managers or owners can archive inspections';
  END IF;
  SELECT status INTO current_status FROM inspections WHERE id = p_inspection_id;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Inspection not found';
  END IF;
  IF current_status != 'sent' THEN
    RAISE EXCEPTION 'Only sent inspections can be archived';
  END IF;
  UPDATE inspections
  SET archived = true, archived_at = now()
  WHERE id = p_inspection_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.archive_inspection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_inspection(uuid) TO authenticated;
