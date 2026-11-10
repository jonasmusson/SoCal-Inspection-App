-- REVIEW ONLY — not applied to production.
-- SoCal HUB one-step physical clipboard apply v1.
-- A manager reviews interpreted clipboard lines in the UI, then this transaction
-- creates the audit record and canonical HUB work entries exactly once.

create table if not exists public.hub_clipboard_intakes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  org_id uuid not null,
  vehicle_id uuid not null,
  project_id uuid not null,
  created_by uuid not null references auth.users(id),
  summary text not null default '' check (char_length(summary) <= 4000),
  invoice_ready boolean not null default false,
  status text not null default 'applied'
    check (status in ('applied','void')),
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint hub_clipboard_intakes_project_scope_fkey
    foreign key (project_id, org_id, vehicle_id)
    references public.hub_pilot_projects(id, org_id, vehicle_id)
    on delete restrict
);

create table if not exists public.hub_clipboard_intake_media (
  intake_id uuid not null references public.hub_clipboard_intakes(id) on delete cascade,
  media_id uuid not null references public.hub_pilot_media(id) on delete restrict,
  primary key (intake_id, media_id)
);

create table if not exists public.hub_clipboard_lines (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.hub_clipboard_intakes(id) on delete cascade,
  line_order integer not null check (line_order between 1 and 100),
  technician_user_id uuid not null references auth.users(id),
  task_id uuid null references public.hub_project_tasks(id) on delete set null,
  work_date date not null,
  system text not null
    check (system in ('Engine','Transmission','Suspension','Brakes','Electrical','Body / Paint','Interior','Wheels / Tires','General','Other')),
  work_performed_raw text not null default '' check (char_length(work_performed_raw) <= 2000),
  invoice_description text not null check (char_length(btrim(invoice_description)) between 2 and 2000),
  actual_hours numeric(6,2) not null check (actual_hours > 0 and actual_hours <= 24),
  billable_hours numeric(6,2) null check (billable_hours is null or (billable_hours >= 0 and billable_hours <= 24)),
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  warning text not null default '' check (char_length(warning) <= 1000),
  work_entry_id uuid not null unique references public.hub_work_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (intake_id, line_order)
);

create index if not exists hub_clipboard_intakes_project_idx
  on public.hub_clipboard_intakes (project_id, applied_at desc);

create index if not exists hub_clipboard_lines_tech_date_idx
  on public.hub_clipboard_lines (technician_user_id, work_date desc);

alter table public.hub_clipboard_intakes enable row level security;
alter table public.hub_clipboard_intake_media enable row level security;
alter table public.hub_clipboard_lines enable row level security;

revoke all on table public.hub_clipboard_intakes from anon, authenticated;
revoke all on table public.hub_clipboard_intake_media from anon, authenticated;
revoke all on table public.hub_clipboard_lines from anon, authenticated;

comment on table public.hub_clipboard_intakes is
  'Audit record for manager-reviewed physical clipboard photo intake. Applied work becomes canonical hub_work_entries.';
comment on table public.hub_clipboard_lines is
  'Reviewed clipboard line and immutable link to the resulting HUB work entry.';

create or replace function public.hub_apply_clipboard_intake(
  p_actor uuid,
  p_org uuid,
  p_request uuid,
  p_project uuid,
  p_media_ids uuid[],
  p_summary text,
  p_lines jsonb,
  p_invoice_ready boolean default false
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  actor_role text;
  p public.hub_pilot_projects;
  rec public.hub_operation_receipts;
  intake_id uuid := gen_random_uuid();
  payload_hash text;
  line_count integer;
  media_count integer;
  line record;
  technician uuid;
  task uuid;
  work_date_value date;
  system_value text;
  raw_value text;
  description_value text;
  actual_value numeric;
  billable_value numeric;
  confidence_value text;
  warning_value text;
  work_id uuid;
  work_ids uuid[] := array[]::uuid[];
  out jsonb;
begin
  select role into actor_role
  from public.hub_pilot_members
  where org_id=p_org and user_id=p_actor and active
  for share;

  if actor_role not in ('owner','manager') then
    raise exception 'Management permission required';
  end if;
  if p_invoice_ready and actor_role <> 'owner' then
    raise exception 'Owner permission required to mark clipboard work ready for invoice';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request::text));

  payload_hash := md5(
    jsonb_build_object(
      'project_id',p_project,
      'media_ids',coalesce(to_jsonb(p_media_ids),'[]'::jsonb),
      'summary',coalesce(p_summary,''),
      'lines',coalesce(p_lines,'[]'::jsonb),
      'invoice_ready',coalesce(p_invoice_ready,false)
    )::text
  );

  select * into rec
  from public.hub_operation_receipts
  where id=p_request;

  if found then
    if rec.org_id<>p_org or rec.actor_id<>p_actor or rec.kind<>'clipboard_apply' or rec.payload_hash<>payload_hash then
      raise exception 'Request conflict';
    end if;
    return rec.result;
  end if;

  select * into p
  from public.hub_pilot_projects
  where id=p_project and org_id=p_org
  for share;
  if not found then raise exception 'Project not found'; end if;

  media_count := coalesce(cardinality(p_media_ids),0);
  if media_count < 1 or media_count > 6 then
    raise exception 'Add between 1 and 6 clipboard photos';
  end if;
  if (
    select count(distinct m.id)
    from public.hub_pilot_media m
    where m.id=any(p_media_ids)
      and m.org_id=p_org
      and m.project_id=p.id
      and m.vehicle_id=p.vehicle_id
  ) <> media_count then
    raise exception 'Clipboard photo does not belong to this project';
  end if;

  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Clipboard lines must be an array';
  end if;
  line_count := jsonb_array_length(p_lines);
  if line_count < 1 or line_count > 100 then
    raise exception 'Clipboard must contain between 1 and 100 reviewed work lines';
  end if;

  insert into public.hub_clipboard_intakes(
    id,request_id,org_id,vehicle_id,project_id,created_by,summary,invoice_ready,status,applied_at
  ) values(
    intake_id,p_request,p_org,p.vehicle_id,p.id,p_actor,left(coalesce(p_summary,''),4000),coalesce(p_invoice_ready,false),'applied',now()
  );

  insert into public.hub_clipboard_intake_media(intake_id,media_id)
  select intake_id,media_id
  from unnest(p_media_ids) as media_id;

  for line in
    select value, ordinality::integer as line_order
    from jsonb_array_elements(p_lines) with ordinality
  loop
    begin
      technician := (line.value->>'technician_user_id')::uuid;
      work_date_value := (line.value->>'work_date')::date;
      actual_value := (line.value->>'actual_hours')::numeric;
      billable_value := case
        when nullif(trim(coalesce(line.value->>'billable_hours','')),'') is null then null
        else (line.value->>'billable_hours')::numeric
      end;
      task := case
        when nullif(trim(coalesce(line.value->>'task_id','')),'') is null then null
        else (line.value->>'task_id')::uuid
      end;
    exception when others then
      raise exception 'Clipboard line % contains an invalid technician, date, task or hours value', line.line_order;
    end;

    if not exists(
      select 1 from public.hub_pilot_members
      where org_id=p_org and user_id=technician and active
    ) then
      raise exception 'Clipboard line % uses an inactive technician', line.line_order;
    end if;

    if task is not null and not exists(
      select 1 from public.hub_project_tasks
      where id=task and org_id=p_org and project_id=p.id and vehicle_id=p.vehicle_id
    ) then
      raise exception 'Clipboard line % task does not belong to this project', line.line_order;
    end if;

    system_value := trim(coalesce(line.value->>'system','General'));
    if system_value not in ('Engine','Transmission','Suspension','Brakes','Electrical','Body / Paint','Interior','Wheels / Tires','General','Other') then
      raise exception 'Clipboard line % has an invalid system', line.line_order;
    end if;

    raw_value := left(trim(coalesce(line.value->>'work_performed_raw','')),2000);
    description_value := left(trim(coalesce(line.value->>'invoice_description','')),2000);
    if length(description_value)<2 then
      raise exception 'Clipboard line % needs a reviewed work description', line.line_order;
    end if;
    if actual_value<=0 or actual_value>24 then
      raise exception 'Clipboard line % actual hours must be between 0 and 24', line.line_order;
    end if;
    if billable_value is not null and (billable_value<0 or billable_value>24) then
      raise exception 'Clipboard line % billable hours must be between 0 and 24', line.line_order;
    end if;

    confidence_value := coalesce(nullif(trim(line.value->>'confidence'),''),'low');
    if confidence_value not in ('high','medium','low') then
      raise exception 'Clipboard line % has invalid confidence', line.line_order;
    end if;
    warning_value := left(trim(coalesce(line.value->>'warning','')),1000);

    insert into public.hub_work_entries(
      org_id,vehicle_id,project_id,task_id,technician_user_id,created_by,updated_by,
      work_date,actual_hours,billable_hours,system,work_performed,internal_notes,status,invoice_state
    ) values(
      p_org,p.vehicle_id,p.id,task,technician,p_actor,p_actor,
      work_date_value,round(actual_value,2),case when billable_value is null then null else round(billable_value,2) end,
      system_value,description_value,
      left(
        concat_ws(E'\n',
          case when raw_value<>'' and raw_value<>description_value then 'Original clipboard: '||raw_value else null end,
          case when warning_value<>'' then 'Clipboard review note: '||warning_value else null end
        ),
        4000
      ),
      'approved',
      case when p_invoice_ready then 'ready' else 'not_ready' end
    )
    returning id into work_id;

    work_ids := array_append(work_ids,work_id);

    insert into public.hub_clipboard_lines(
      intake_id,line_order,technician_user_id,task_id,work_date,system,
      work_performed_raw,invoice_description,actual_hours,billable_hours,
      confidence,warning,work_entry_id
    ) values(
      intake_id,line.line_order,technician,task,work_date_value,system_value,
      raw_value,description_value,round(actual_value,2),
      case when billable_value is null then null else round(billable_value,2) end,
      confidence_value,warning_value,work_id
    );
  end loop;

  insert into public.hub_activity(
    org_id,vehicle_id,project_id,actor_id,event_type,description
  ) values(
    p_org,p.vehicle_id,p.id,p_actor,'clipboard',
    line_count::text||' reviewed clipboard work line'||case when line_count=1 then '' else 's' end||' applied'
  );

  out := jsonb_build_object(
    'intake_id',intake_id,
    'project_id',p.id,
    'vehicle_id',p.vehicle_id,
    'line_count',line_count,
    'work_entry_ids',to_jsonb(work_ids),
    'invoice_ready',coalesce(p_invoice_ready,false)
  );

  insert into public.hub_operation_receipts(
    id,org_id,actor_id,kind,payload_hash,result
  ) values(
    p_request,p_org,p_actor,'clipboard_apply',payload_hash,out
  );

  return out;
end
$function$;

revoke all on function public.hub_apply_clipboard_intake(uuid,uuid,uuid,uuid,uuid[],text,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.hub_apply_clipboard_intake(uuid,uuid,uuid,uuid,uuid[],text,jsonb,boolean)
  to service_role;
