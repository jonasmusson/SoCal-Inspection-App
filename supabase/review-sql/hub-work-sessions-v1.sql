-- REVIEW ONLY — not applied to production.
-- SoCal HUB technician project work sessions v1.
-- Work sessions track active project/task focus. They are not attendance and are
-- not billable until converted into a reviewed HUB work entry.

create table if not exists public.hub_work_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  vehicle_id uuid not null,
  project_id uuid not null,
  task_id uuid null references public.hub_project_tasks(id) on delete set null,
  technician_user_id uuid not null references auth.users(id),
  started_by uuid not null references auth.users(id),
  stopped_by uuid null references auth.users(id),
  started_at timestamptz not null default now(),
  stopped_at timestamptz null,
  status text not null default 'active'
    check (status in ('active','stopped','cancelled')),
  start_note text not null default '' check (char_length(start_note) <= 1000),
  stop_note text not null default '' check (char_length(stop_note) <= 1000),
  work_entry_id uuid null unique references public.hub_work_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_work_sessions_project_scope_fkey
    foreign key (project_id, org_id, vehicle_id)
    references public.hub_pilot_projects(id, org_id, vehicle_id)
    on delete cascade,
  constraint hub_work_sessions_stop_order
    check (stopped_at is null or stopped_at >= started_at),
  constraint hub_work_sessions_state_time
    check (
      (status='active' and stopped_at is null) or
      (status in ('stopped','cancelled') and stopped_at is not null)
    )
);

create unique index if not exists hub_work_sessions_one_active_idx
  on public.hub_work_sessions (org_id, technician_user_id)
  where status='active';

create index if not exists hub_work_sessions_project_idx
  on public.hub_work_sessions (project_id, started_at desc);

create index if not exists hub_work_sessions_task_idx
  on public.hub_work_sessions (task_id, started_at desc)
  where task_id is not null;

alter table public.hub_work_sessions enable row level security;
revoke all on table public.hub_work_sessions from anon, authenticated;

comment on table public.hub_work_sessions is
  'Active/finished technician focus sessions for a HUB project/task. Separate from employee attendance and invoice/billable state.';
