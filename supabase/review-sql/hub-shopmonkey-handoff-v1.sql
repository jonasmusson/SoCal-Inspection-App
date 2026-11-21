-- REVIEW ONLY — not applied to production.
-- SoCal HUB explicit Shopmonkey outbound handoff v1.
-- Shopmonkey remains billing authority. HUB stores verified project/order mappings
-- and durable work-entry -> remote service/labor receipts so retries cannot double-post.

create table if not exists public.hub_shopmonkey_project_links (
  project_id uuid primary key,
  org_id uuid not null,
  vehicle_id uuid not null,
  remote_order_id text not null check (char_length(btrim(remote_order_id)) between 1 and 128),
  remote_order_number text not null default '' check (char_length(remote_order_number) <= 128),
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_shopmonkey_project_links_project_scope_fkey
    foreign key (project_id, org_id, vehicle_id)
    references public.hub_pilot_projects(id, org_id, vehicle_id)
    on delete cascade
);

create unique index if not exists hub_shopmonkey_order_unique
  on public.hub_shopmonkey_project_links (org_id, remote_order_id);


create table if not exists public.hub_shopmonkey_service_links (
  org_id uuid not null references public.hub_pilot_orgs(id) on delete cascade,
  project_id uuid not null references public.hub_pilot_projects(id) on delete cascade,
  system text not null
    check (system in ('Engine','Transmission','Suspension','Brakes','Electrical','Body / Paint','Interior','Wheels / Tires','General','Other')),
  remote_order_id text not null,
  remote_service_id text not null,
  remote_service_name text not null default '',
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, system)
);

create unique index if not exists hub_shopmonkey_service_remote_unique
  on public.hub_shopmonkey_service_links (org_id, remote_order_id, remote_service_id);

create table if not exists public.hub_shopmonkey_sync_runs (
  id uuid primary key,
  org_id uuid not null references public.hub_pilot_orgs(id) on delete cascade,
  project_id uuid not null references public.hub_pilot_projects(id) on delete cascade,
  remote_order_id text not null,
  actor_id uuid not null references auth.users(id),
  payload_hash text not null,
  status text not null
    check (status in ('started','partial','complete','failed')),
  requested_work_entry_ids uuid[] not null default array[]::uuid[],
  result jsonb not null default '{}'::jsonb,
  error_summary text not null default '' check (char_length(error_summary) <= 2000),
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists hub_shopmonkey_sync_runs_project_idx
  on public.hub_shopmonkey_sync_runs (project_id, created_at desc);

create table if not exists public.hub_shopmonkey_work_links (
  work_entry_id uuid primary key references public.hub_work_entries(id) on delete restrict,
  org_id uuid not null references public.hub_pilot_orgs(id) on delete cascade,
  project_id uuid not null references public.hub_pilot_projects(id) on delete cascade,
  sync_run_id uuid not null references public.hub_shopmonkey_sync_runs(id) on delete restrict,
  remote_order_id text not null,
  remote_service_id text not null,
  remote_labor_id text not null,
  remote_service_name text not null default '',
  remote_labor_name text not null default '',
  synced_hours numeric(6,2) not null check (synced_hours >= 0 and synced_hours <= 24),
  synced_rate_cents integer not null check (synced_rate_cents >= 0 and synced_rate_cents <= 1000000),
  synced_by uuid not null references auth.users(id),
  synced_at timestamptz not null default now()
);

create index if not exists hub_shopmonkey_work_links_project_idx
  on public.hub_shopmonkey_work_links (project_id, synced_at desc);

alter table public.hub_shopmonkey_project_links enable row level security;
alter table public.hub_shopmonkey_service_links enable row level security;
alter table public.hub_shopmonkey_sync_runs enable row level security;
alter table public.hub_shopmonkey_work_links enable row level security;

revoke all on table public.hub_shopmonkey_project_links from anon, authenticated;
revoke all on table public.hub_shopmonkey_service_links from anon, authenticated;
revoke all on table public.hub_shopmonkey_sync_runs from anon, authenticated;
revoke all on table public.hub_shopmonkey_work_links from anon, authenticated;

comment on table public.hub_shopmonkey_project_links is
  'Owner-verified HUB project to Shopmonkey Order ID mapping. Human order number is reference only.';
comment on table public.hub_shopmonkey_service_links is
  'Verified reusable Shopmonkey service section for one HUB project/system. Prevents duplicate service headings across sync batches.';
comment on table public.hub_shopmonkey_sync_runs is
  'Durable owner-approved outbound Shopmonkey write attempt and result.';
comment on table public.hub_shopmonkey_work_links is
  'Proof that one canonical HUB work entry became one specific Shopmonkey labor line.';

-- Do not mark a HUB work entry synced merely because a request was attempted.
-- The Edge Function updates invoice_state only after a remote labor ID has been
-- confirmed and this mapping row has been persisted.
