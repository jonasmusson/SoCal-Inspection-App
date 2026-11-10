create function public.hub_approve_member(p_actor uuid,p_org uuid,p_request uuid,p_role text,p_vehicle_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.hub_access_requests; v uuid;
begin
 if not exists(select 1 from public.hub_pilot_members where org_id=p_org and user_id=p_actor and active and role='owner') then raise exception 'Owner approval required'; end if;
 if p_role not in ('tech','manager') then raise exception 'Invalid staff role'; end if;
 select * into r from public.hub_access_requests where id=p_request and org_id=p_org for update;
 if not found or r.user_id=p_actor then raise exception 'Invalid access request'; end if;
 if not exists(select 1 from auth.users where id=r.user_id and email_confirmed_at is not null) then raise exception 'Email verification required'; end if;
 if exists(select 1 from public.hub_pilot_members where org_id=p_org and user_id=r.user_id and role='owner') then raise exception 'Owner membership cannot be changed here'; end if;
 foreach v in array coalesce(p_vehicle_ids,array[]::uuid[]) loop
  if not exists(select 1 from public.hub_pilot_vehicles where id=v and org_id=p_org) then raise exception 'Vehicle not in organization'; end if;
 end loop;
 insert into public.hub_pilot_members(org_id,user_id,role,active) values(p_org,r.user_id,p_role,true) on conflict(org_id,user_id) do update set role=excluded.role,active=true;
 delete from public.hub_vehicle_assignments where org_id=p_org and user_id=r.user_id;
 foreach v in array coalesce(p_vehicle_ids,array[]::uuid[]) loop
  insert into public.hub_vehicle_assignments(org_id,vehicle_id,user_id) values(p_org,v,r.user_id) on conflict do nothing;
 end loop;
 update public.user_profiles set status='active',role=p_role,updated_at=now() where id=r.user_id and role<>'owner';
 update public.hub_access_requests set status='approved',decided_by=p_actor,decided_at=now() where id=r.id;
 return jsonb_build_object('approved',true,'user_id',r.user_id,'role',p_role);
end $$;
create function public.hub_set_assignments(p_actor uuid,p_org uuid,p_user uuid,p_vehicle_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid;
begin
 if not exists(select 1 from public.hub_pilot_members where org_id=p_org and user_id=p_actor and active and role='owner') then raise exception 'Owner permission required'; end if;
 if not exists(select 1 from public.hub_pilot_members where org_id=p_org and user_id=p_user and active and role='tech') then raise exception 'Active technician required'; end if;
 foreach v in array coalesce(p_vehicle_ids,array[]::uuid[]) loop
  if not exists(select 1 from public.hub_pilot_vehicles where id=v and org_id=p_org) then raise exception 'Vehicle not in organization'; end if;
 end loop;
 delete from public.hub_vehicle_assignments where org_id=p_org and user_id=p_user;
 foreach v in array coalesce(p_vehicle_ids,array[]::uuid[]) loop
  insert into public.hub_vehicle_assignments(org_id,vehicle_id,user_id) values(p_org,v,p_user) on conflict do nothing;
 end loop;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.hub_approve_member(uuid,uuid,uuid,text,uuid[]),public.hub_set_assignments(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.hub_approve_member(uuid,uuid,uuid,text,uuid[]),public.hub_set_assignments(uuid,uuid,uuid,uuid[]) to service_role;
create index hub_links_vehicle on public.hub_inspection_links(org_id,vehicle_id);
create index hub_requests_org on public.hub_access_requests(org_id,status);
create index hub_evidence_org_item on public.hub_media_evidence(org_id,item_id);
