-- REVIEW ONLY — not applied to production.
-- SoCal HUB technician task-capability matrix v1.

create table if not exists public.hub_member_task_skills (
  org_id uuid not null,
  user_id uuid not null,
  skill_code text not null
    check (skill_code in ('L1','L2','L2S','L3','F','QA')),
  notes text not null default '' check (char_length(notes) <= 1000),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, skill_code),
  constraint hub_member_task_skills_member_fkey
    foreign key (org_id, user_id)
    references public.hub_pilot_members(org_id, user_id)
    on delete cascade
);

create index if not exists hub_member_task_skills_user_idx
  on public.hub_member_task_skills (user_id, org_id);

alter table public.hub_member_task_skills enable row level security;

-- HUB clients use the authenticated workspace Edge Function rather than direct table access.
revoke all on table public.hub_member_task_skills from anon, authenticated;

comment on table public.hub_member_task_skills is
  'Explicit HUB whiteboard task codes approved for each active team member. No implicit hierarchy; grant every code a technician may take.';

comment on column public.hub_member_task_skills.skill_code is
  'L1 apprentice/basic; L2 independent general mechanical; L2S mechanical with a required technical supervisor; L3 advanced/diagnostic; F fabrication; QA final technical sign-off.';
