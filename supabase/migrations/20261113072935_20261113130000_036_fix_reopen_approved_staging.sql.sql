/*
# Fix: Prevent techs from reopening approved/sent inspections

## Problem
The inspections_update_authorized policy's USING clause allows techs to target
approved/sent inspections for UPDATE. The WITH CHECK only validates the NEW row's
status, so a tech can set status = 'in_progress' on an approved inspection —
effectively reopening it. Confirmed in staging testing.

## Fix
Drop and recreate the inspections_update_authorized policy with
`status NOT IN ('approved', 'sent')` added to the tech/creator branches of BOTH
the USING and WITH CHECK expressions. Managers/owners remain unrestricted.
*/

DROP POLICY IF EXISTS "inspections_update_authorized" ON inspections;

CREATE POLICY "inspections_update_authorized"
ON inspections FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_owner()
  OR (assigned_tech_id = auth.uid() AND public.is_active_staff() AND status NOT IN ('approved', 'sent'))
  OR (created_by = auth.uid() AND public.is_active_staff() AND status NOT IN ('approved', 'sent'))
)
WITH CHECK (
  public.is_manager_or_owner()
  OR (assigned_tech_id = auth.uid() AND public.is_active_staff() AND status NOT IN ('approved', 'sent'))
  OR (created_by = auth.uid() AND public.is_active_staff() AND status NOT IN ('approved', 'sent'))
);
