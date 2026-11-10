-- REVIEW ONLY — not applied to production.
-- SoCal HUB management settings + productivity summary foundation v1.

create table if not exists public.hub_org_settings (
  org_id uuid primary key references public.hub_pilot_orgs(id) on delete cascade,
  weekly_billable_target numeric(6,2) not null default 30
    check (weekly_billable_target >= 0 and weekly_billable_target <= 100),
  labor_rate numeric(8,2) not null default 175
    check (labor_rate > 0 and labor_rate <= 2000),
  timezone text not null default 'America/Los_Angeles'
    check (char_length(timezone) between 3 and 80),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hub_org_settings enable row level security;

-- HUB settings are mediated by the workspace Edge Function.
revoke all on table public.hub_org_settings from anon, authenticated;

comment on table public.hub_org_settings is
  'Organization-level HUB operating targets used for management reporting. Not payroll or accounting truth.';
