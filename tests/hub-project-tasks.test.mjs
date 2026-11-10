import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Project Whiteboard schema is relational and project-scoped",()=>{
  const sql=read("supabase/review-sql/hub-project-tasks-v1.sql");
  for(const text of [
    "create table if not exists public.hub_project_tasks",
    "foreign key (project_id, org_id, vehicle_id)",
    "references public.hub_pilot_projects(id, org_id, vehicle_id)",
    "skill_code",
    "'L1','L2','L2S','L3','F','QA'",
    "estimated_hours",
    "assigned_user_id",
    "supervisor_user_id",
    "revoke all on table public.hub_project_tasks from anon, authenticated",
    "add column if not exists task_id uuid null",
    "hub_work_entries_task_id_fkey",
  ]) assert.ok(sql.includes(text),text);
});

test("HUB snapshot exposes project tasks and task dictionaries",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.match(source,/const VERSION = "0\.11\.0"/);
  for(const text of [
    '"hub_project_tasks"',
    "project_tasks",
    "task_statuses: TASK_STATUSES",
    "task_priorities: TASK_PRIORITIES",
    "task_skills: TASK_SKILLS",
  ]) assert.ok(source.includes(text),text);
});

test("Management owns task definition while technicians only progress their assigned tasks",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const create=source.indexOf('if (action === "task/create")');
  const update=source.indexOf('if (action === "task/update")');
  const vehicle=source.indexOf('if (action === "vehicle/update")');
  assert.ok(create>0&&update>create&&vehicle>update);
  const createBlock=source.slice(create,update);
  const updateBlock=source.slice(update,vehicle);
  assert.match(createBlock,/management\(m\)/);
  assert.match(createBlock,/Assigned technician must have access to this vehicle/);
  assert.match(updateBlock,/task\.assigned_user_id !== u\.id/);
  assert.match(updateBlock,/This task is assigned to another technician/);
  assert.match(updateBlock,/if \(isManager\)/);
  for(const field of ["title","priority","skill_code","estimated_hours","assigned_user_id","supervisor_user_id","sort_order"])
    assert.ok(updateBlock.includes('"'+field+'" in b'),field);
});

test("Digital clipboard work can point back to the originating whiteboard task",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const work=source.slice(source.indexOf('if (action === "work/create")'),source.indexOf('if (action === "work/update")'));
  assert.match(work,/task = b\.task_id \? await taskFor/);
  assert.match(work,/Task and project do not match/);
  assert.match(work,/This task is assigned to another technician/);
  assert.match(work,/task_id: task\?\.id \|\| null/);
});
