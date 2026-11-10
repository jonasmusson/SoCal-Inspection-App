-- REVIEW ONLY — not applied to production.
-- SoCal HUB Contribution + Capacity model v1.
-- Separates useful contribution, management allocation, economics and constraints
-- so non-billable work does not automatically look like poor technician performance.

alter table public.hub_pilot_projects
  add column if not exists contribution_default text not null default 'customer_production'
    check (contribution_default in (
      'customer_production','customer_support','internal_investment',
      'shop_operations','training_supervision','rework_warranty'
    )),
  add column if not exists economic_default text not null default 'billable_labor'
    check (economic_default in (
      'billable_labor','customer_fee','internal_investment',
      'operating_cost','training_investment','quality_cost'
    ));

alter table public.hub_work_entries
  add column if not exists contribution_type text not null default 'customer_production'
    check (contribution_type in (
      'customer_production','customer_support','internal_investment',
      'shop_operations','training_supervision','rework_warranty'
    )),
  add column if not exists economic_type text not null default 'billable_labor'
    check (economic_type in (
      'billable_labor','customer_fee','internal_investment',
      'operating_cost','training_investment','quality_cost'
    ));

create table if not exists public.hub_capacity_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.hub_pilot_orgs(id) on delete cascade,
  technician_user_id uuid not null references auth.users(id),
  project_id uuid null references public.hub_pilot_projects(id) on delete set null,
  task_id uuid null references public.hub_project_tasks(id) on delete set null,
  work_date date not null,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  category text not null
    check (category in (
      'transport_support','shop_operations','training','supervision','admin_documentation',
      'no_work_available','waiting_parts','waiting_authorization','waiting_supervision',
      'vehicle_unavailable','equipment_issue','unaccounted'
    )),
  credit_class text not null
    check (credit_class in ('productive','constrained','unaccounted')),
  notes text not null default '' check (char_length(notes) <= 4000),
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review','approved','void')),
  source text not null default 'self'
    check (source in ('self','manager')),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  manager_note text not null default '' check (char_length(manager_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_capacity_category_credit_match check (
    (category in ('transport_support','shop_operations','training','supervision','admin_documentation')
      and credit_class='productive')
    or
    (category in ('no_work_available','waiting_parts','waiting_authorization','waiting_supervision',
                  'vehicle_unavailable','equipment_issue')
      and credit_class='constrained')
    or
    (category='unaccounted' and credit_class='unaccounted')
  )
);

create index if not exists hub_capacity_entries_tech_date_idx
  on public.hub_capacity_entries (org_id, technician_user_id, work_date desc, created_at desc);

create index if not exists hub_capacity_entries_review_idx
  on public.hub_capacity_entries (org_id, review_status, work_date desc);

create index if not exists hub_capacity_entries_project_idx
  on public.hub_capacity_entries (project_id, work_date desc)
  where project_id is not null;

alter table public.hub_capacity_entries enable row level security;

-- Browser access is mediated by the authenticated socal-hub-workspace Edge Function.
revoke all on table public.hub_capacity_entries from public, anon, authenticated;
grant all on table public.hub_capacity_entries to service_role;

comment on column public.hub_work_entries.contribution_type is
  'Where technician capacity contributed: customer production/support, internal investment, operations, training/supervision or rework/warranty.';
comment on column public.hub_work_entries.economic_type is
  'Economic treatment kept separate from contribution: billable labor, customer fee, internal investment, operating cost, training investment or quality cost.';
comment on table public.hub_capacity_entries is
  'Reviewed non-project capacity/support/constraint time. Approved productive rows earn productive credit; constrained rows explain lost production opportunity; unaccounted rows remain visible rather than being mislabeled.';
