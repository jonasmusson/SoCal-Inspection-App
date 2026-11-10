-- REVIEW ONLY — not applied to production.
-- SoCal HUB employee attendance / Timecards v1.
-- Attendance is intentionally separate from project work entries and billing.

create table if not exists public.hub_timecard_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.hub_pilot_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz null,
  break_minutes integer not null default 0
    check (break_minutes >= 0 and break_minutes <= 720),
  notes text not null default '' check (char_length(notes) <= 2000),
  manager_note text not null default '' check (char_length(manager_note) <= 2000),
  source text not null default 'self'
    check (source in ('self','manager')),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_timecard_clock_order
    check (clock_out is null or clock_out >= clock_in),
  constraint hub_timecard_max_shift
    check (clock_out is null or clock_out <= clock_in + interval '18 hours')
);

create unique index if not exists hub_timecard_one_open_shift_idx
  on public.hub_timecard_shifts (org_id, user_id)
  where clock_out is null;

create index if not exists hub_timecard_user_date_idx
  on public.hub_timecard_shifts (org_id, user_id, work_date desc, clock_in desc);

create index if not exists hub_timecard_org_date_idx
  on public.hub_timecard_shifts (org_id, work_date desc, clock_in desc);

alter table public.hub_timecard_shifts enable row level security;

-- The HUB browser is mediated by socal-hub-workspace. Attendance is not exposed
-- directly through PostgREST to anon/authenticated clients.
revoke all on table public.hub_timecard_shifts from anon, authenticated;

comment on table public.hub_timecard_shifts is
  'HUB employee attendance. Separate from customer project work entries, billable hours, payroll and Shopmonkey.';
