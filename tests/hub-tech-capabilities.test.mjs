import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Technician capability matrix is explicit, editable data",()=>{
  const sql=read("supabase/review-sql/hub-member-task-skills-v1.sql");
  for(const text of [
    "create table if not exists public.hub_member_task_skills",
    "skill_code text not null",
    "'L1','L2','L2S','L3','F','QA'",
    "foreign key (org_id, user_id)",
    "references public.hub_pilot_members(org_id, user_id)",
    "approved_by uuid not null",
    "revoke all on table public.hub_member_task_skills from anon, authenticated",
    "No implicit hierarchy",
  ]) assert.ok(sql.includes(text),text);
});

test("HUB snapshot exposes only authorized capability scope",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes("member_task_skills"));
  assert.ok(source.includes('"hub_member_task_skills"'));
  assert.ok(source.includes('m.role === "tech" ? "&user_id=eq." + m.user_id : ""'));
});

test("Only owner can change capability grants while management can review them",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const list=source.indexOf('if (action === "capabilities/list")');
  const set=source.indexOf('if (action === "capabilities/set")');
  const timeline=source.indexOf('if (action === "timeline/add")');
  assert.ok(list>0&&set>list&&timeline>set);
  assert.match(source.slice(list,set),/management\(m\)/);
  assert.match(source.slice(set,timeline),/management\(m, true\)/);
  assert.ok(source.slice(set,timeline).includes("hub_member_task_skills"));
});

test("Task assignment is rejected unless the technician holds the exact task code",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.match(source,/async function assertTaskSkill/);
  assert.match(source,/Assigned technician is not approved for this task level/);
  const create=source.slice(source.indexOf('if (action === "task/create")'),source.indexOf('if (action === "task/update")'));
  assert.match(create,/await assertTaskSkill\(m, assigned, skill\)/);
});

test("L2S work requires an eligible technical supervisor with vehicle access",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.match(source,/async function assertTechnicalSupervisor/);
  assert.match(source,/Supervisor must be management or approved for L3 \/ QA work/);
  assert.match(source,/Technical supervisor must have access to this vehicle/);
  assert.match(source,/Supervised mechanical tasks require a supervisor/);
});
