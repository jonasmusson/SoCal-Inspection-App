import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("supabase/functions/socal-hub-workspace/index.ts");

test("Management review queue is management-only and read-only",()=>{
  const start=source.indexOf('if (action === "management/review-queue")');
  const end=source.indexOf('if (action === "timeline/add")');
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/management\(m\)/);
  assert.ok(block.includes("Review queue is read-only."));
  for(const mutator of [
    '"PATCH"',
    '"POST"',
    '"DELETE"',
    "shopmonkeyClient().add",
  ]) assert.ok(!block.includes(mutator),mutator);
});

test("Review queue surfaces the shop bottlenecks that need manager attention",()=>{
  const start=source.indexOf('if (action === "management/review-queue")');
  const end=source.indexOf('if (action === "timeline/add")');
  const block=source.slice(start,end);
  for(const text of [
    "pending_work",
    "ready_for_shopmonkey",
    "unassigned_tasks",
    "blocked_tasks",
    "waiting_tasks",
    "in_progress_tasks",
    "parts_requests",
    "open_timecards",
    "inspections_pending_review",
    "stale_open_timecards",
  ]) assert.ok(block.includes(text),text);
});

test("Review queue keeps project hours and billable hours separate",()=>{
  const start=source.indexOf('if (action === "management/review-queue")');
  const end=source.indexOf('if (action === "timeline/add")');
  const block=source.slice(start,end);
  assert.ok(block.includes("pending_project_hours"));
  assert.ok(block.includes("ready_billable_hours"));
  assert.ok(block.includes('sumHours(pendingWorkRows,"actual_hours")'));
  assert.ok(block.includes('sumHours(readyWorkRows,"billable_hours")'));
});

test("Review queue flags long-open timecards without silently closing them",()=>{
  const start=source.indexOf('if (action === "management/review-queue")');
  const end=source.indexOf('if (action === "timeline/add")');
  const block=source.slice(start,end);
  assert.ok(block.includes("open_hours"));
  assert.ok(block.includes("ageHours>12"));
  assert.ok(block.includes("needs_manager_attention"));
  assert.ok(!block.includes('clock_out:'));
});

test("Review queue decorates items with project and vehicle context without customer contact data",()=>{
  const start=source.indexOf('if (action === "management/review-queue")');
  const end=source.indexOf('if (action === "timeline/add")');
  const block=source.slice(start,end);
  assert.ok(block.includes("project_title"));
  assert.ok(block.includes("vehicle_name"));
  assert.ok(block.includes("shopmonkey_linked"));
  assert.ok(!block.includes("customer_email"));
  assert.ok(!block.includes("customer_phone"));
});
