import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("HUB productivity settings are configurable per organization",()=>{
  const sql=read("supabase/review-sql/hub-org-settings-productivity-v1.sql");
  for(const text of [
    "create table if not exists public.hub_org_settings",
    "weekly_billable_target numeric(6,2) not null default 30",
    "labor_rate numeric(8,2) not null default 175",
    "America/Los_Angeles",
    "revoke all on table public.hub_org_settings from anon, authenticated",
    "Not payroll or accounting truth",
  ]) assert.ok(sql.includes(text),text);
});

test("Only management can read productivity and only owner can change settings",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const get=source.indexOf('if (action === "settings/get")');
  const update=source.indexOf('if (action === "settings/update")');
  const summary=source.indexOf('if (action === "productivity/summary")');
  const timeline=source.indexOf('if (action === "timeline/add")');
  assert.ok(get>0&&update>get&&summary>update&&timeline>summary);
  assert.match(source.slice(get,update),/management\(m\)/);
  assert.match(source.slice(update,summary),/management\(m, true\)/);
  assert.match(source.slice(summary,timeline),/management\(m\)/);
});

test("Productivity summary keeps attendance, project and approved billable hours distinct",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const summary=source.slice(source.indexOf('if (action === "productivity/summary")'),source.indexOf('if (action === "timeline/add")'));
  for(const text of [
    "attendance_hours",
    "project_hours",
    "recorded_billable_hours",
    "approved_billable_hours",
    "pending_project_hours",
    "pending_review_count",
    "open_shift_count",
    "utilization_percent",
    "project_coverage_percent",
    "efficiency_percent",
    "target_attainment_percent",
    "approved_labor_value",
  ]) assert.ok(summary.includes(text),text);
  assert.ok(summary.includes('row.status === "approved" && row.billable_hours != null'));
  assert.ok(summary.includes('row.status === "pending_review"'));
  assert.ok(summary.includes("if (!shift.clock_out)"));
  assert.ok(summary.includes("Open shifts are not counted as completed attendance."));
});

test("Owner role does not inflate the default production target",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes('members.filter((x: any) => x.role !== "owner")'));
  assert.ok(source.includes("target_billable_hours: round2(rows.length * target)"));
});

test("Management dashboard includes work-queue bottlenecks",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const summary=source.slice(source.indexOf('if (action === "productivity/summary")'),source.indexOf('if (action === "timeline/add")'));
  for(const text of [
    "unassigned_ready_count",
    "unassigned_ready_hours",
    "blocked_count",
    "blocked_hours",
    "waiting_count",
    "waiting_hours",
    "in_progress_count",
    "in_progress_hours",
    "assigned_ready_hours",
    "assigned_blocked_hours",
  ]) assert.ok(summary.includes(text),text);
});

test("Labor value is explicitly not treated as invoice or accounting truth",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes("Labor value is approved billable hours multiplied by the configured shop rate; it is not an invoice, payment or accounting total."));
});
