-- SoCal Hub Camera Pilot v0.8 — additive only. Never alters legacy inspection tables/buckets.
create table public.hub_pilot_orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(length(slug) between 3 and 70),
  display_name text not null,
  created_at timestamptz not null default now()
);
create table public.hub_pilot_members (
  org_id uuid not null references public.hub_pilot_orgs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner','manager','tech')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id,user_id)
);
create table public.hub_pilot_vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.hub_pilot_orgs(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 2 and 160),
  year integer check(year between 1880 and 2100),
  make text,
  model text,
  vin text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id,org_id)
);
create table public.hub_pilot_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.hub_pilot_orgs(id) on delete restrict,
  vehicle_id uuid not null,
  title text not null check(length(trim(title)) between 2 and 160),
  kind text not null default 'repair',
  status text not null default 'active',
  shopmonkey_order_ref text,
  created_at timestamptz not null default now(),
  foreign key (vehicle_id,org_id) references public.hub_pilot_vehicles(id,org_id) on delete restrict,
  unique (id,org_id,vehicle_id)
);
create table public.hub_pilot_media (
  id uuid primary key,
  org_id uuid not null references public.hub_pilot_orgs(id) on delete restrict,
  vehicle_id uuid not null,
  project_id uuid,
  storage_key text not null unique,
  original_name text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif')),
  byte_count integer not null check(byte_count > 0 and byte_count <= 25165824),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  caption text default '',
  category text not null default 'Progress',
  uploaded_by uuid not null references auth.users(id),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (vehicle_id,org_id) references public.hub_pilot_vehicles(id,org_id) on delete restrict,
  foreign key (project_id,org_id,vehicle_id) references public.hub_pilot_projects(id,org_id,vehicle_id) on delete restrict,
  constraint hub_pilot_media_object_key check (storage_key like org_id::text || '/' || vehicle_id::text || '/' || id::text || '.%')
);
create index hub_pilot_media_vehicle_recent on public.hub_pilot_media(org_id,vehicle_id,created_at desc);
create index hub_pilot_media_project_recent on public.hub_pilot_media(project_id,created_at desc);

alter table public.hub_pilot_orgs enable row level security;
alter table public.hub_pilot_members enable row level security;
alter table public.hub_pilot_vehicles enable row level security;
alter table public.hub_pilot_projects enable row level security;
alter table public.hub_pilot_media enable row level security;
-- Member select is deliberately SELF-only, avoiding recursive member-policy evaluation.
create policy hub_pilot_members_self_read on public.hub_pilot_members for select to authenticated
 using (user_id = (select auth.uid()));
create policy hub_pilot_orgs_member_read on public.hub_pilot_orgs for select to authenticated
 using (exists (select 1 from public.hub_pilot_members m where m.org_id=id and m.user_id=(select auth.uid()) and m.active));
create policy hub_pilot_vehicles_member_read on public.hub_pilot_vehicles for select to authenticated
 using (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_vehicles.org_id and m.user_id=(select auth.uid()) and m.active));
create policy hub_pilot_vehicles_manager_create on public.hub_pilot_vehicles for insert to authenticated
 with check (created_by=(select auth.uid()) and exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_vehicles.org_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','manager')));
create policy hub_pilot_vehicles_manager_update on public.hub_pilot_vehicles for update to authenticated
 using (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_vehicles.org_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','manager')))
 with check (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_vehicles.org_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','manager')));
create policy hub_pilot_projects_member_read on public.hub_pilot_projects for select to authenticated
 using (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_projects.org_id and m.user_id=(select auth.uid()) and m.active));
create policy hub_pilot_projects_manager_create on public.hub_pilot_projects for insert to authenticated
 with check (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_projects.org_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','manager')));
create policy hub_pilot_projects_manager_update on public.hub_pilot_projects for update to authenticated
 using (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_projects.org_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','manager')))
 with check (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_projects.org_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','manager')));
create policy hub_pilot_media_member_read on public.hub_pilot_media for select to authenticated
 using (exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_media.org_id and m.user_id=(select auth.uid()) and m.active));
create policy hub_pilot_media_member_insert on public.hub_pilot_media for insert to authenticated
 with check (uploaded_by=(select auth.uid())
   and exists (select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_media.org_id and m.user_id=(select auth.uid()) and m.active)
 );

revoke all on public.hub_pilot_orgs, public.hub_pilot_members, public.hub_pilot_vehicles, public.hub_pilot_projects, public.hub_pilot_media from anon;
grant select on public.hub_pilot_orgs, public.hub_pilot_members to authenticated;
grant select,insert,update on public.hub_pilot_vehicles, public.hub_pilot_projects to authenticated;
grant select,insert on public.hub_pilot_media to authenticated;
-- Dedicated isolated PRIVATE bucket, no inherited public photo policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('hub-pilot-private','hub-pilot-private',false,25165824,ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif']);
create policy hub_pilot_storage_member_read on storage.objects for select to authenticated
 using (bucket_id='hub-pilot-private'
   and exists (select 1
     from public.hub_pilot_vehicles v
     join public.hub_pilot_members m on m.org_id=v.org_id
     where m.user_id=(select auth.uid()) and m.active
       and v.org_id::text=(storage.foldername(name))[1]
       and v.id::text=(storage.foldername(name))[2]));
create policy hub_pilot_storage_member_insert on storage.objects for insert to authenticated
 with check (bucket_id='hub-pilot-private'
   and exists (select 1
     from public.hub_pilot_vehicles v
     join public.hub_pilot_members m on m.org_id=v.org_id
     where m.user_id=(select auth.uid()) and m.active
       and v.org_id::text=(storage.foldername(name))[1]
       and v.id::text=(storage.foldername(name))[2]));
-- Seed ONLY the existing verified owner profile. No new auth accounts or legacy inspection changes.
insert into public.hub_pilot_orgs(slug,display_name) values ('socal-autoworks','SoCal Autoworks');
insert into public.hub_pilot_members(org_id,user_id,role,active)
 select o.id,p.id,'owner',true from public.hub_pilot_orgs o cross join public.user_profiles p
 where o.slug='socal-autoworks' and p.role='owner' and p.status='active';
insert into public.hub_pilot_vehicles(org_id,display_name,year,make,model,created_by)
 select o.id,'1978 Ford F-250',1978,'Ford','F-250',m.user_id
 from public.hub_pilot_orgs o join public.hub_pilot_members m on m.org_id=o.id and m.role='owner'
 where o.slug='socal-autoworks';
insert into public.hub_pilot_projects(org_id,vehicle_id,title,kind,status)
 select v.org_id,v.id,'Workshop photo pilot','documentation','active'
 from public.hub_pilot_vehicles v where v.display_name='1978 Ford F-250';
