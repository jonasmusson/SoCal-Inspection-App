/*
# Fix: Managers cannot demote or deactivate owners

## Problem
set_user_role allows any manager to demote an owner to manager/tech (as long as
another owner exists). set_user_status allows any manager to deactivate an owner.
The user's requirement: "Managers cannot improperly demote or deactivate Owners."

## Fix
- set_user_role: if target is currently an owner, caller must be an owner
- set_user_status: if target is currently an owner, caller must be an owner
- Both functions already have last-owner protection; this adds caller-authority protection
*/

CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF target_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can modify the role of another owner';
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
$function$;

CREATE OR REPLACE FUNCTION public.set_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF target_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can deactivate or reactivate another owner';
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
$function$;
