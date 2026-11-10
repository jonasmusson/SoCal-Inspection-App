import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("supabase/functions/socal-hub-workspace/index.ts");

test("Tech Home returns a compact assignment-scoped shop view",()=>{
  const start=source.indexOf('if (action === "tech/home")');
  const claim=source.indexOf('if (action === "task/claim")');
  assert.ok(start>0&&claim>start);
  const block=source.slice(start,claim);
  for(const text of [
    "clocked_in",
    "active_session",
    "current_task",
    "next_tasks",
    "ready_to_claim",
    "blocked_tasks",
    "waiting_tasks",
    "parts_requests",
    "pending_work_entries",
    "capabilities",
    "need_work",
  ]) assert.ok(block.includes(text),text);
});

test("Tech Home does not return customer, wage, productivity or Shopmonkey write controls",()=>{
  const start=source.indexOf('if (action === "tech/home")');
  const claim=source.indexOf('if (action === "task/claim")');
  const block=source.slice(start,claim);
  for(const forbidden of [
    "customer_phone",
    "customer_email",
    "pay_rate",
    "hourly_rate",
    "compensation",
    "approved_labor_value",
    "weekly_billable_target",
    "shopmonkeyClient()",
  ]) assert.ok(!block.includes(forbidden),forbidden);
  assert.ok(block.includes("Tech Home contains assignment-scoped shop work only."));
});

test("Ready-to-claim work is restricted to assigned vehicles and exact approved task code",()=>{
  const start=source.indexOf('if (action === "tech/home")');
  const claim=source.indexOf('if (action === "task/claim")');
  const block=source.slice(start,claim);
  assert.ok(block.includes('"hub_vehicle_assignments"'));
  assert.ok(block.includes("assigned_user_id=is.null&status=eq.todo"));
  assert.ok(block.includes("skillSet.has(task.skill_code)"));
  assert.ok(block.includes('task.skill_code !== "L2S" || Boolean(task.supervisor_user_id)'));
});

test("Claim Task is technician-only and rejects ineligible or already-claimed work",()=>{
  const start=source.indexOf('if (action === "task/claim")');
  const project=source.indexOf('if (action === "project/create")');
  const block=source.slice(start,project);
  for(const text of [
    'm.role !== "tech"',
    "This task is already assigned.",
    "Only an unassigned To Do task can be claimed.",
    "You are not approved for this task level.",
    "This supervised task needs a supervisor before it can be claimed.",
    "This vehicle is not assigned to you.",
  ]) assert.ok(block.includes(text),text);
});

test("Claim Task uses optimistic concurrency so two devices cannot both win",()=>{
  const start=source.indexOf('if (action === "task/claim")');
  const project=source.indexOf('if (action === "project/create")');
  const block=source.slice(start,project);
  assert.ok(block.includes("assigned_user_id=is.null&status=eq.todo&updated_at=eq."));
  assert.ok(block.includes("This task was claimed or changed on another device."));
});
