import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("HUB Timecards schema keeps attendance separate from project labor",()=>{
  const sql=read("supabase/review-sql/hub-timecards-v1.sql");
  for(const text of [
    "create table if not exists public.hub_timecard_shifts",
    "clock_in timestamptz not null",
    "clock_out timestamptz null",
    "break_minutes",
    "hub_timecard_one_open_shift_idx",
    "where clock_out is null",
    "interval '18 hours'",
    "revoke all on table public.hub_timecard_shifts from anon, authenticated",
    "Separate from customer project work entries",
  ]) assert.ok(sql.includes(text),text);
  assert.ok(!sql.includes("billable_hours"));
  assert.ok(!sql.includes("pay_rate"));
  assert.ok(!sql.includes("wage"));
});

test("HUB snapshot returns attendance separately from work entries",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.match(source,/const VERSION = "0\.12\.0"/);
  assert.match(source,/"hub_timecard_shifts"/);
  assert.match(source,/timecards,/);
  assert.match(source,/m\.role === "tech" \? "&user_id=eq\." \+ m\.user_id : ""/);
});

test("Timeclock punch is self-service with guarded manager punch and stale-write protection",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "timeclock/punch")');
  const end=source.indexOf('if (action === "timecard/update")');
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  for(const text of [
    "clock_in",
    "clock_out",
    "management(m)",
    "already clocked in",
    "not clocked in",
    "18 * 60",
    "needs manager correction",
    "updated_at=eq.",
    "changed on another device",
  ]) assert.ok(block.includes(text),text);
});

test("Manager correction remains attendance-only and revision-aware",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "timecard/update")');
  const end=source.indexOf('if (action === "timeline/add")');
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/management\(m\)/);
  for(const field of ["work_date","clock_in","clock_out","break_minutes","notes","manager_note","expected_updated_at"])
    assert.ok(block.includes(field),field);
  assert.ok(!block.includes("billable_hours"));
  assert.ok(!block.includes("invoice_state"));
});
