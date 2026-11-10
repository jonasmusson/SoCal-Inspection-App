-- READ ONLY — SoCal HUB Workshop OS production preflight.
-- Run before applying any approved Workshop OS migrations.
-- This file performs SELECT-only checks and must not alter production state.

-- 1. Baseline HUB tables expected before the new Workshop OS migrations.
with required(name) as (
  values
    ('hub_pilot_orgs'),
    ('hub_pilot_members'),
    ('hub_pilot_vehicles'),
    ('hub_pilot_projects'),
    ('hub_vehicle_assignments'),
    ('hub_pilot_media'),
    ('hub_upload_jobs'),
    ('hub_activity'),
    ('hub_operation_receipts'),
    ('hub_work_entries'),
    ('hub_inspection_links'),
    ('inspections')
)
select
  r.name as required_table,
  to_regclass('public.'||r.name) is not null as present
from required r
order by r.name;

-- 2. Current pilot data volume. Unexpectedly large counts should trigger review,
-- not an automatic migration.
select
  (select count(*) from public.hub_pilot_orgs) as organizations,
  (select count(*) from public.hub_pilot_members) as members,
  (select count(*) from public.hub_pilot_vehicles) as vehicles,
  (select count(*) from public.hub_pilot_projects) as projects,
  (select count(*) from public.hub_vehicle_assignments) as vehicle_assignments,
  (select count(*) from public.hub_work_entries) as work_entries,
  (select count(*) from public.hub_pilot_media) as media_assets,
  (select count(*) from public.hub_inspection_links) as inspection_links;

-- 3. Membership / assignment anomalies.
select 'inactive_member_assignment' as issue, count(*) as count
from public.hub_vehicle_assignments a
left join public.hub_pilot_members m
  on m.org_id=a.org_id and m.user_id=a.user_id
where m.user_id is null or not m.active
union all
select 'cross_org_vehicle_assignment', count(*)
from public.hub_vehicle_assignments a
left join public.hub_pilot_vehicles v
  on v.id=a.vehicle_id and v.org_id=a.org_id
where v.id is null;

-- 4. Project / vehicle scope anomalies.
select 'project_missing_vehicle_scope' as issue, count(*) as count
from public.hub_pilot_projects p
left join public.hub_pilot_vehicles v
  on v.id=p.vehicle_id and v.org_id=p.org_id
where v.id is null
union all
select 'work_entry_missing_project_scope', count(*)
from public.hub_work_entries w
left join public.hub_pilot_projects p
  on p.id=w.project_id and p.org_id=w.org_id and p.vehicle_id=w.vehicle_id
where p.id is null;

-- 5. Work-entry review/billing state sanity.
select status, invoice_state, count(*) as count
from public.hub_work_entries
group by status, invoice_state
order by status, invoice_state;

select 'synced_without_approved' as issue, count(*) as count
from public.hub_work_entries
where invoice_state='synced' and status<>'approved'
union all
select 'ready_without_billable_hours', count(*)
from public.hub_work_entries
where invoice_state='ready'
  and (billable_hours is null or billable_hours<=0);

-- 6. Project Shopmonkey reference duplicates. Human order refs are not canonical
-- remote IDs, but duplicates should be reviewed before verified links are added.
select shopmonkey_order_ref, count(*) as project_count
from public.hub_pilot_projects
where nullif(trim(shopmonkey_order_ref),'') is not null
group by shopmonkey_order_ref
having count(*)>1
order by project_count desc, shopmonkey_order_ref;

-- 7. Required existing transaction functions.
with required(name) as (
  values
    ('hub_create_job'),
    ('hub_commit_photo'),
    ('hub_start_inspection'),
    ('hub_approve_member'),
    ('hub_set_assignments')
)
select
  r.name as required_function,
  exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=r.name
  ) as present
from required r
order by r.name;

-- 8. RLS state on baseline HUB tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'hub_pilot_orgs','hub_pilot_members','hub_pilot_vehicles',
    'hub_pilot_projects','hub_vehicle_assignments','hub_pilot_media',
    'hub_upload_jobs','hub_activity','hub_operation_receipts',
    'hub_work_entries','hub_inspection_links'
  )
order by c.relname;

-- 9. Verify the composite project identity needed by new child tables.
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.hub_pilot_projects'::regclass
  and contype in ('p','u')
order by conname;

-- 10. Existing data that would violate the proposed one-active-work-session or
-- one-open-timecard concepts cannot exist yet because those tables are new.
-- Confirm there are no unexpected prior tables using those canonical names.
select
  to_regclass('public.hub_project_tasks') as existing_project_tasks,
  to_regclass('public.hub_member_task_skills') as existing_member_task_skills,
  to_regclass('public.hub_timecard_shifts') as existing_timecards,
  to_regclass('public.hub_org_settings') as existing_hub_settings,
  to_regclass('public.hub_parts_requests') as existing_parts_requests,
  to_regclass('public.hub_clipboard_intakes') as existing_clipboard_intakes,
  to_regclass('public.hub_shopmonkey_project_links') as existing_shopmonkey_links,
  to_regclass('public.hub_work_sessions') as existing_work_sessions;
