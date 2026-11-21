-- REVIEW ONLY — not applied to production.
-- SoCal HUB Project Whiteboard v1.
-- This forward migration assumes the currently deployed November 2026 HUB tables exist.

create table if not exists public.hub_project_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  vehicle_id uuid not null,
  project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 300),
  status text not null default 'todo'
    check (status in ('todo','in_progress','waiting','blocked','done')),
  priority text not null default 'normal'
    check (priority in ('urgent','high','normal','low')),
  skill_code text not null default 'L1'
    check (skill_code in ('L1','L2','L2S','L3','F','QA')),
  estimated_hours numeric(6,2) not null default 0
    check (estimated_hours >= 0 and estimated_hours <= 250),
  assigned_user_id uuid null references auth.users(id) on delete set null,
  supervisor_user_id uuid null references auth.users(id) on delete set null,
  status_note text not null default '' check (char_length(status_note) <= 2000),
  notes text not null default '' check (char_length(notes) <= 4000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_project_tasks_project_scope_fkey
    foreign key (project_id, org_id, vehicle_id)
    references public.hub_pilot_projects(id, org_id, vehicle_id)
    on delete cascade
);

create index if not exists hub_project_tasks_project_sort_idx
  on public.hub_project_tasks (project_id, status, sort_order, created_at);

create index if not exists hub_project_tasks_assigned_idx
  on public.hub_project_tasks (assigned_user_id, status, project_id)
  where assigned_user_id is not null and status <> 'done';

alter table public.hub_project_tasks enable row level security;

-- The HUB browser is intentionally mediated by socal-hub-workspace.
-- Do not expose the task table directly to anon/authenticated clients.
revoke all on table public.hub_project_tasks from anon, authenticated;

alter table public.hub_work_entries
  add column if not exists task_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hub_work_entries_task_id_fkey'
      and conrelid = 'public.hub_work_entries'::regclass
  ) then
    alter table public.hub_work_entries
      add constraint hub_work_entries_task_id_fkey
      foreign key (task_id)
      references public.hub_project_tasks(id)
      on delete set null;
  end if;
end
$$;

create index if not exists hub_work_entries_task_idx
  on public.hub_work_entries (task_id)
  where task_id is not null;

comment on table public.hub_project_tasks is
  'HUB project whiteboard tasks. Client access is mediated by the socal-hub-workspace Edge Function.';

comment on column public.hub_project_tasks.skill_code is
  'L1 apprentice/basic; L2 general mechanical; L2S mechanical with supervision; L3 advanced/diagnostic; F fabrication; QA lead/final check.';

comment on column public.hub_work_entries.task_id is
  'Optional originating whiteboard task for a technician digital-clipboard work entry.';
