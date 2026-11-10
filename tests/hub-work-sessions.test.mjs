import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Work sessions are separate from attendance and billable work",()=>{
  const sql=read("supabase/review-sql/hub-work-sessions-v1.sql");
  for(const text of [
    "create table if not exists public.hub_work_sessions",
    "technician_user_id uuid not null",
    "started_at timestamptz not null",
    "stopped_at timestamptz null",
    "status in ('active','stopped','cancelled')",
    "hub_work_sessions_one_active_idx",
    "where status='active'",
    "Separate from employee attendance and invoice/billable state",
  ]) assert.ok(sql.includes(text),text);
  assert.ok(!sql.includes("billable_hours"));
  assert.ok(!sql.includes("clock_in"));
});

test("Snapshot exposes work sessions with technician-only self scoping",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes('"hub_work_sessions"'));
  assert.ok(source.includes("work_sessions"));
  assert.ok(source.includes('m.role === "tech" ? "&technician_user_id=eq." + m.user_id : ""'));
});

test("Start Work requires an authorized project and assigned task",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "work-session/start")');
  const stop=source.indexOf('if (action === "work-session/stop")');
  assert.ok(start>0&&stop>start);
  const block=source.slice(start,stop);
  for(const text of [
    "projectFor",
    "taskFor",
    "Technicians can only start their own work session",
    "Assign this task to the technician before starting work",
    "Only To Do or In Progress tasks can be started",
    "already has active project work",
    'status: "active"',
  ]) assert.ok(block.includes(text),text);
  assert.ok(block.includes('status: "in_progress"'));
});

test("Stop Work is revision-safe and returns elapsed hours only as a suggestion",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "work-session/stop")');
  const cancel=source.indexOf('if (action === "work-session/cancel")');
  const block=source.slice(start,cancel);
  for(const text of [
    "Technicians can only stop their own work session",
    "elapsedHours",
    "elapsedHours > 18",
    "updated_at=eq.",
    "changed on another device",
    "suggested_actual_hours",
    "Elapsed session time is a suggestion, not billable truth",
  ]) assert.ok(block.includes(text),text);
  assert.ok(!block.includes('invoice_state: "ready"'));
  assert.ok(!block.includes('status: "approved"'));
});

test("Cancelling an accidental work session requires a reason and creates no work entry",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "work-session/cancel")');
  const work=source.indexOf('if (action === "work/create")');
  const block=source.slice(start,work);
  assert.ok(block.includes("Add a short reason for cancelling this work session."));
  assert.ok(block.includes('status: "cancelled"'));
  assert.ok(!block.includes('"hub_work_entries"'));
});
