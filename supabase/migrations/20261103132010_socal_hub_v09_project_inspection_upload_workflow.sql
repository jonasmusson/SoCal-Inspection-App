create table public.hub_pilot_contacts (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.hub_pilot_orgs(id),
 name text not null check(length(trim(name)) between 1 and 160), email text not null default '', phone text not null default '',
 created_at timestamptz not null default now(), unique(id,org_id)
);
alter table public.hub_pilot_vehicles add column contact_id uuid, add column notes text not null default '';
alter table public.hub_pilot_vehicles add constraint hub_vehicle_contact_scope foreign key(contact_id,org_id) references public.hub_pilot_contacts(id,org_id);
alter table public.hub_pilot_projects add column notes text not null default '', add column updated_at timestamptz not null default now();
alter table public.hub_pilot_media add column verified_at timestamptz, add column archive_key text;
create table public.hub_vehicle_assignments (
 org_id uuid not null, vehicle_id uuid not null, user_id uuid not null,
 primary key(org_id,vehicle_id,user_id),
 foreign key(vehicle_id,org_id) references public.hub_pilot_vehicles(id,org_id),
 foreign key(org_id,user_id) references public.hub_pilot_members(org_id,user_id)
);
create table public.hub_access_requests (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.hub_pilot_orgs(id),
 user_id uuid not null references auth.users(id), full_name text not null, email text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid references auth.users(id),
 unique(org_id,user_id)
);
create table public.hub_inspection_links (
 project_id uuid primary key, org_id uuid not null, vehicle_id uuid not null,
 inspection_id uuid not null unique references public.inspections(id), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(project_id,org_id,vehicle_id) references public.hub_pilot_projects(id,org_id,vehicle_id)
);
create table public.hub_media_evidence (
 org_id uuid not null references public.hub_pilot_orgs(id), item_id uuid not null references public.inspection_items(id),
 media_id uuid not null references public.hub_pilot_media(id), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), primary key(item_id,media_id)
);
create table public.hub_upload_jobs (
 id uuid primary key, org_id uuid not null references public.hub_pilot_orgs(id), vehicle_id uuid not null, project_id uuid,
 user_id uuid not null references auth.users(id), inspection_item_id uuid references public.inspection_items(id),
 storage_key text not null unique, original_name text not null, content_type text not null,
 byte_count integer not null check(byte_count between 1 and 25165824), sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 category text not null default 'Progress', captured_at timestamptz,
 state text not null default 'reserved' check(state in ('reserved','verified')),
 expires_at timestamptz not null default now()+interval '7 days', created_at timestamptz not null default now(),
 foreign key(vehicle_id,org_id) references public.hub_pilot_vehicles(id,org_id),
 foreign key(project_id,org_id,vehicle_id) references public.hub_pilot_projects(id,org_id,vehicle_id)
);
create table public.hub_activity (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.hub_pilot_orgs(id), vehicle_id uuid,
 project_id uuid, actor_id uuid not null references auth.users(id), event_type text not null, description text not null,
 created_at timestamptz not null default now(), foreign key(vehicle_id,org_id) references public.hub_pilot_vehicles(id,org_id)
);
create table public.hub_operation_receipts (
 id uuid primary key, org_id uuid not null references public.hub_pilot_orgs(id), actor_id uuid not null references auth.users(id),
 kind text not null, payload_hash text not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.hub_pilot_contacts enable row level security;
alter table public.hub_vehicle_assignments enable row level security;
alter table public.hub_access_requests enable row level security;
alter table public.hub_inspection_links enable row level security;
alter table public.hub_media_evidence enable row level security;
alter table public.hub_upload_jobs enable row level security;
alter table public.hub_activity enable row level security;
alter table public.hub_operation_receipts enable row level security;
revoke all on public.hub_pilot_contacts,public.hub_vehicle_assignments,public.hub_access_requests,public.hub_inspection_links,public.hub_media_evidence,public.hub_upload_jobs,public.hub_activity,public.hub_operation_receipts from anon,authenticated;
grant all on public.hub_pilot_contacts,public.hub_vehicle_assignments,public.hub_access_requests,public.hub_inspection_links,public.hub_media_evidence,public.hub_upload_jobs,public.hub_activity,public.hub_operation_receipts to service_role;
grant select on public.hub_vehicle_assignments,public.hub_upload_jobs to authenticated;
create policy hub_assignment_self_read on public.hub_vehicle_assignments for select to authenticated using(user_id=(select auth.uid()));
create policy hub_upload_self_read on public.hub_upload_jobs for select to authenticated using(user_id=(select auth.uid()));
drop policy hub_pilot_vehicles_member_read on public.hub_pilot_vehicles;
create policy hub_pilot_vehicles_member_read on public.hub_pilot_vehicles for select to authenticated using(
 exists(select 1 from public.hub_pilot_members m where m.org_id=hub_pilot_vehicles.org_id and m.user_id=(select auth.uid()) and m.active and
 (m.role in ('owner','manager') or exists(select 1 from public.hub_vehicle_assignments a where a.org_id=hub_pilot_vehicles.org_id and a.vehicle_id=hub_pilot_vehicles.id and a.user_id=(select auth.uid())))));
drop policy hub_pilot_projects_member_read on public.hub_pilot_projects;
create policy hub_pilot_projects_member_read on public.hub_pilot_projects for select to authenticated using(
 exists(select 1 from public.hub_pilot_vehicles v where v.id=hub_pilot_projects.vehicle_id and v.org_id=hub_pilot_projects.org_id));
drop policy hub_pilot_media_member_read on public.hub_pilot_media;
create policy hub_pilot_media_member_read on public.hub_pilot_media for select to authenticated using(
 exists(select 1 from public.hub_pilot_vehicles v where v.id=hub_pilot_media.vehicle_id and v.org_id=hub_pilot_media.org_id));
revoke insert,update,delete on public.hub_pilot_media from authenticated,anon;
revoke insert,update,delete on public.hub_pilot_vehicles,public.hub_pilot_projects from authenticated,anon;
drop policy hub_pilot_storage_member_insert on storage.objects;
create policy hub_pilot_storage_reserved_insert on storage.objects for insert to authenticated with check(
 bucket_id='hub-pilot-private' and exists(
 select 1 from public.hub_upload_jobs j join public.hub_pilot_vehicles v on v.id=j.vehicle_id and v.org_id=j.org_id
 where j.storage_key=storage.objects.name and j.user_id=(select auth.uid()) and j.state='reserved' and j.expires_at>now()));
create function public.hub_create_job(p_actor uuid,p_org uuid,p_request uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.hub_pilot_vehicles; p public.hub_pilot_projects; c uuid; out jsonb; rec public.hub_operation_receipts; yr integer;
begin
 if not exists(select 1 from public.hub_pilot_members where user_id=p_actor and org_id=p_org and active and role in ('owner','manager')) then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request::text));
 select * into rec from public.hub_operation_receipts where id=p_request;
 if found then
  if rec.org_id<>p_org or rec.actor_id<>p_actor or rec.kind<>'create_job' or rec.payload_hash<>md5(p_data::text) then raise exception 'Request conflict'; end if;
  return rec.result;
 end if;
 if nullif(p_data->>'vehicle_id','') is not null then
  select * into v from public.hub_pilot_vehicles where id=(p_data->>'vehicle_id')::uuid and org_id=p_org;
  if not found then raise exception 'Vehicle not found'; end if;
 else
  if length(trim(coalesce(p_data->>'vehicle_name','')))<2 or length(p_data->>'vehicle_name')>160 then raise exception 'Vehicle name required'; end if;
  c:=null;
  if nullif(trim(p_data->>'contact_name'),'') is not null then
   insert into public.hub_pilot_contacts(org_id,name,email,phone) values(p_org,left(trim(p_data->>'contact_name'),160),left(coalesce(p_data->>'contact_email',''),254),left(coalesce(p_data->>'contact_phone',''),80)) returning id into c;
  end if;
  yr:=nullif(p_data->>'year','')::integer;
  insert into public.hub_pilot_vehicles(org_id,display_name,year,make,model,vin,contact_id,created_by,notes)
  values(p_org,trim(p_data->>'vehicle_name'),yr,left(p_data->>'make',80),left(p_data->>'model',100),nullif(left(p_data->>'vin',64),''),c,p_actor,left(coalesce(p_data->>'vehicle_notes',''),4000)) returning * into v;
 end if;
 if coalesce((p_data->>'create_project')::boolean,true) then
  if length(trim(coalesce(p_data->>'project_name','')))<2 then raise exception 'Project name required'; end if;
  insert into public.hub_pilot_projects(org_id,vehicle_id,title,kind,status,shopmonkey_order_ref,notes)
  values(p_org,v.id,left(trim(p_data->>'project_name'),160),left(coalesce(p_data->>'kind','repair'),40),'active',nullif(left(p_data->>'shopmonkey_order_ref',100),''),left(coalesce(p_data->>'notes',''),4000)) returning * into p;
 end if;
 out:=jsonb_build_object('vehicle',to_jsonb(v),'project',case when p.id is null then null else to_jsonb(p) end);
 insert into public.hub_operation_receipts(id,org_id,actor_id,kind,payload_hash,result) values(p_request,p_org,p_actor,'create_job',md5(p_data::text),out);
 insert into public.hub_activity(org_id,vehicle_id,project_id,actor_id,event_type,description) values(p_org,v.id,p.id,p_actor,'created',case when p.id is null then 'Vehicle created' else 'Project created: '||p.title end);
 return out;
end $$;
create function public.hub_start_inspection(p_actor uuid,p_org uuid,p_project uuid,p_template uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.hub_pilot_projects; v public.hub_pilot_vehicles; c public.hub_pilot_contacts; insp uuid; sec record; sid uuid; num integer:=0;
begin
 if not exists(select 1 from public.hub_pilot_members where user_id=p_actor and org_id=p_org and active and role in ('owner','manager')) then raise exception 'Not authorized'; end if;
 select * into p from public.hub_pilot_projects where id=p_project and org_id=p_org for update;
 if not found then raise exception 'Project not found'; end if;
 select inspection_id into insp from public.hub_inspection_links where project_id=p_project and org_id=p_org;
 if found then return jsonb_build_object('inspection_id',insp,'existing',true); end if;
 select * into v from public.hub_pilot_vehicles where id=p.vehicle_id and org_id=p_org;
 if v.year is null or nullif(trim(v.make),'') is null or nullif(trim(v.model),'') is null then raise exception 'Add year, make and model to this vehicle first'; end if;
 if not exists(select 1 from public.inspection_templates where id=p_template and is_active) then raise exception 'Template unavailable'; end if;
 if not exists(select 1 from public.user_profiles where id=p_actor and status='active') then raise exception 'Inspection profile not active'; end if;
 select * into c from public.hub_pilot_contacts where id=v.contact_id and org_id=p_org;
 insert into public.inspections(customer_first_name,customer_last_name,customer_email,customer_phone,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,created_by,assigned_tech_id,template_id,checkin_notes)
 values(coalesce(c.name,''),'',coalesce(c.email,''),coalesce(c.phone,''),v.year,v.make,v.model,v.vin,p_actor,p_actor,p_template,'Created from SoCal Hub project: '||p.title) returning id into insp;
 for sec in select * from public.template_sections where template_id=p_template and is_active order by sort_order,id loop
  num:=num+1;
  insert into public.inspection_sections(inspection_id,section_number,section_name) values(insp,num,sec.section_name) returning id into sid;
  insert into public.inspection_items(section_id,item_name,item_key,photo_required,video_required,notes_required,photo_mode,video_mode,notes_mode)
  select sid,item_name,item_key,coalesce(photo_required,false),coalesce(video_required,false),coalesce(notes_required,false),coalesce(photo_mode,'optional'),coalesce(video_mode,'optional'),coalesce(notes_mode,'optional') from public.template_items where section_id=sec.id and is_active order by sort_order,id;
 end loop;
 if num=0 then raise exception 'Template has no sections'; end if;
 insert into public.hub_inspection_links(project_id,org_id,vehicle_id,inspection_id,created_by) values(p.id,p_org,v.id,insp,p_actor);
 insert into public.hub_activity(org_id,vehicle_id,project_id,actor_id,event_type,description) values(p_org,v.id,p.id,p_actor,'inspection','Inspection started');
 return jsonb_build_object('inspection_id',insp,'existing',false);
end $$;
create function public.hub_commit_photo(p_actor uuid,p_upload uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.hub_upload_jobs; m public.hub_pilot_media;
begin
 select * into j from public.hub_upload_jobs where id=p_upload and user_id=p_actor for update;
 if not found then raise exception 'Upload unavailable'; end if;
 if not exists(select 1 from public.hub_pilot_members where org_id=j.org_id and user_id=p_actor and active) then raise exception 'Membership inactive'; end if;
 if not exists(select 1 from storage.objects where bucket_id='hub-pilot-private' and name=j.storage_key) or not exists(select 1 from storage.objects where bucket_id='hub-media-archive' and name=j.storage_key) then raise exception 'Cloud originals incomplete'; end if;
 insert into public.hub_pilot_media(id,org_id,vehicle_id,project_id,storage_key,original_name,content_type,byte_count,sha256,category,uploaded_by,captured_at,verified_at,archive_key)
 values(j.id,j.org_id,j.vehicle_id,j.project_id,j.storage_key,j.original_name,j.content_type,j.byte_count,j.sha256,j.category,j.user_id,j.captured_at,now(),j.storage_key)
 on conflict(id) do nothing;
 select * into m from public.hub_pilot_media where id=j.id;
 if m.sha256<>j.sha256 or m.storage_key<>j.storage_key or m.uploaded_by<>p_actor then raise exception 'Upload identity conflict'; end if;
 if j.inspection_item_id is not null then
  insert into public.hub_media_evidence(org_id,item_id,media_id,created_by) values(j.org_id,j.inspection_item_id,m.id,p_actor) on conflict do nothing;
 end if;
 if j.state<>'verified' then
  insert into public.hub_activity(org_id,vehicle_id,project_id,actor_id,event_type,description) values(j.org_id,j.vehicle_id,j.project_id,p_actor,'photo','Photo saved and integrity verified');
 end if;
 update public.hub_upload_jobs set state='verified' where id=j.id;
 return to_jsonb(m);
end $$;
revoke all on function public.hub_create_job(uuid,uuid,uuid,jsonb), public.hub_start_inspection(uuid,uuid,uuid,uuid), public.hub_commit_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hub_create_job(uuid,uuid,uuid,jsonb), public.hub_start_inspection(uuid,uuid,uuid,uuid), public.hub_commit_photo(uuid,uuid) to service_role;
create index hub_activity_recent on public.hub_activity(org_id,vehicle_id,created_at desc);
create index hub_upload_user on public.hub_upload_jobs(user_id,state);
create index hub_assignments_user on public.hub_vehicle_assignments(user_id,org_id);
