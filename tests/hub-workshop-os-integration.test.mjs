import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("supabase/functions/socal-hub-workspace/index.ts");

test("Workshop OS integration exposes one combined project snapshot",()=>{
  for(const text of [
    "work_entries",
    "project_tasks",
    "member_task_skills",
    "parts_requests",
    "clipboard_intakes",
    "shopmonkey_project_links",
    "shopmonkey_work_links",
    "timecards",
  ]) assert.ok(source.includes(text),text);
});

test("Workshop OS keeps planning, work, attendance, parts, inspection and billing as distinct operations",()=>{
  for(const action of [
    'action === "task/create"',
    'action === "task/update"',
    'action === "work/create"',
    'action === "work/update"',
    'action === "timeclock/punch"',
    'action === "timecard/update"',
    'action === "parts/create"',
    'action === "parts/update"',
    'action === "inspection/start"',
    'action === "inspection/get"',
    'action === "clipboard/apply"',
    'action === "clipboard/get"',
    'action === "productivity/summary"',
    'action === "shopmonkey/preview"',
    'action === "shopmonkey/sync"',
  ]) assert.ok(source.includes(action),action);
});

test("Technician snapshot remains assignment-scoped across work and attendance",()=>{
  assert.ok(source.includes('m.role === "tech"'));
  assert.ok(source.includes('"hub_vehicle_assignments"'));
  assert.ok(source.includes('m.role === "tech" ? "&user_id=eq." + m.user_id : ""'));
  assert.ok(source.includes("This vehicle is not assigned to you."));
});

test("Owner-only boundaries remain explicit after integration",()=>{
  const ownerOnly=[
    'action === "capabilities/set"',
    'action === "settings/update"',
    'action === "shopmonkey/link/verify"',
    'action === "shopmonkey/service/link"',
    'action === "shopmonkey/sync"',
  ];
  for(const action of ownerOnly){
    const start=source.indexOf(action);
    assert.ok(start>0,action);
    const block=source.slice(start,start+9000);
    assert.match(block,/management\(m, true\)/,action);
  }
});

test("Workshop OS review SQL covers every new durable module before production migration",()=>{
  for(const path of [
    "supabase/review-sql/hub-project-tasks-v1.sql",
    "supabase/review-sql/hub-member-task-skills-v1.sql",
    "supabase/review-sql/hub-timecards-v1.sql",
    "supabase/review-sql/hub-org-settings-productivity-v1.sql",
    "supabase/review-sql/hub-parts-requests-v1.sql",
    "supabase/review-sql/hub-clipboard-apply-v1.sql",
    "supabase/review-sql/hub-shopmonkey-handoff-v1.sql",
  ]) assert.ok(read(path).includes("REVIEW ONLY"),path);
});

test("Combined backend is still review-first and does not auto-sync Shopmonkey from normal work creation",()=>{
  const work=source.slice(source.indexOf('if (action === "work/create")'),source.indexOf('if (action === "work/update")'));
  assert.ok(work.includes('status: "pending_review"'));
  assert.ok(!work.includes("shopmonkeyClient"));
  assert.ok(!work.includes("hub_shopmonkey_sync_runs"));
});
