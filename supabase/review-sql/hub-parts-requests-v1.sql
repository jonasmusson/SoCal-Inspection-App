-- REVIEW ONLY — not applied to production.
-- SoCal HUB project/task Parts Requests v1.

create table if not exists public.hub_parts_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  vehicle_id uuid not null,
  project_id uuid not null,
  task_id uuid null references public.hub_project_tasks(id) on delete set null,
  requested_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  part_name text not null check (char_length(btrim(part_name)) between 2 and 300),
  part_number text not null default '' check (char_length(part_number) <= 160),
  quantity integer not null default 1 check (quantity between 1 and 999),
  urgency text not null default 'normal'
    check (urgency in ('normal','urgent')),
  status text not null default 'requested'
    check (status in ('requested','ordered','received','cancelled')),
  vendor text not null default '' check (char_length(vendor) <= 200),
  order_reference text not null default '' check (char_length(order_reference) <= 200),
  notes text not null default '' check (char_length(notes) <= 4000),
  manager_note text not null default '' check (char_length(manager_note) <= 2000),
  ordered_at timestamptz null,
  received_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_parts_requests_project_scope_fkey
    foreign key (project_id, org_id, vehicle_id)
    references public.hub_pilot_projects(id, org_id, vehicle_id)
    on delete cascade
);

create index if not exists hub_parts_requests_project_status_idx
  on public.hub_parts_requests (project_id, status, created_at desc);

create index if not exists hub_parts_requests_requester_idx
  on public.hub_parts_requests (requested_by, status, created_at desc);

create index if not exists hub_parts_requests_task_idx
  on public.hub_parts_requests (task_id)
  where task_id is not null;

alter table public.hub_parts_requests enable row level security;

-- Browser access remains mediated by socal-hub-workspace.
revoke all on table public.hub_parts_requests from anon, authenticated;

comment on table public.hub_parts_requests is
  'Technician/manager project parts requests linked to a HUB project and optional whiteboard task. Not purchasing or accounting truth.';
