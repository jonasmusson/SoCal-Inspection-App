import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Parts Requests are project-scoped and optionally linked to a whiteboard task",()=>{
  const sql=read("supabase/review-sql/hub-parts-requests-v1.sql");
  for(const text of [
    "create table if not exists public.hub_parts_requests",
    "project_id uuid not null",
    "task_id uuid null references public.hub_project_tasks(id)",
    "requested_by uuid not null",
    "part_name text not null",
    "quantity integer not null default 1",
    "'requested','ordered','received','cancelled'",
    "foreign key (project_id, org_id, vehicle_id)",
    "references public.hub_pilot_projects(id, org_id, vehicle_id)",
    "revoke all on table public.hub_parts_requests from anon, authenticated",
    "Not purchasing or accounting truth",
  ]) assert.ok(sql.includes(text),text);
});

test("Project snapshot includes Parts Requests in the same vehicle scope",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes("parts_requests"));
  assert.ok(source.includes('"hub_parts_requests"'));
  assert.ok(source.includes("part_request_statuses: PART_REQUEST_STATUSES"));
  assert.ok(source.includes("part_request_urgency: PART_REQUEST_URGENCY"));
});

test("Technicians can create a request only through an authorized project",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const create=source.slice(source.indexOf('if (action === "parts/create")'),source.indexOf('if (action === "parts/update")'));
  assert.match(create,/await projectFor\(m, id\(b\.project_id\)\)/);
  assert.match(create,/task = b\.task_id \? await taskFor/);
  assert.match(create,/Task and project do not match/);
  assert.match(create,/status: "requested"/);
  assert.ok(!create.includes('status: b.status'));
});

test("Technicians cannot alter ordering state after a request leaves Requested",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const update=source.slice(source.indexOf('if (action === "parts/update")'),source.indexOf('if (action === "timeline/add")'));
  assert.match(update,/request\.requested_by !== u\.id \|\| request\.status !== "requested"/);
  assert.match(update,/Only management can change a parts request after it leaves Requested/);
  assert.match(update,/if \(isManager\)/);
  assert.ok(update.includes('"vendor" in b'));
  assert.ok(update.includes('"order_reference" in b'));
  assert.ok(update.includes('"manager_note" in b'));
  assert.ok(update.includes('"status" in b'));
});

test("Parts Requests preserve optimistic concurrency and order/receipt timestamps",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const update=source.slice(source.indexOf('if (action === "parts/update")'),source.indexOf('if (action === "timeline/add")'));
  assert.ok(update.includes("expected_updated_at"));
  assert.ok(update.includes("ordered_at"));
  assert.ok(update.includes("received_at"));
  assert.ok(update.includes("This parts request changed on another device."));
});
