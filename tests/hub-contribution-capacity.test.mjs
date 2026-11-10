import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("supabase/functions/socal-hub-workspace/index.ts");

test("Contribution model separates useful work from economic treatment",()=>{
  const sql=read("supabase/review-sql/hub-contribution-capacity-v1.sql");
  for(const text of [
    "contribution_default",
    "economic_default",
    "contribution_type",
    "economic_type",
    "'customer_production','customer_support','internal_investment'",
    "'billable_labor','customer_fee','internal_investment'",
    "'training_supervision','rework_warranty'",
    "'training_investment','quality_cost'",
  ]) assert.ok(sql.includes(text),text);
});

test("Non-project capacity table distinguishes productive, constrained and unaccounted time",()=>{
  const sql=read("supabase/review-sql/hub-contribution-capacity-v1.sql");
  for(const text of [
    "create table if not exists public.hub_capacity_entries",
    "credit_class text not null",
    "'productive','constrained','unaccounted'",
    "'no_work_available','waiting_parts','waiting_authorization','waiting_supervision'",
    "'transport_support','shop_operations','training','supervision','admin_documentation'",
    "hub_capacity_category_credit_match",
    "review_status in ('pending_review','approved','void')",
    "revoke all on table public.hub_capacity_entries from public, anon, authenticated",
  ]) assert.ok(sql.includes(text),text);
});

test("Work entries inherit project contribution/economic defaults and technicians cannot set economics directly",()=>{
  const start=source.indexOf('if (action === "work/create")');
  const end=source.indexOf('if (action === "work/update")');
  const create=source.slice(start,end);
  assert.ok(create.includes("contribution_type: CONTRIBUTION_TYPES.includes(p.contribution_default)"));
  assert.ok(create.includes("economic_type: ECONOMIC_TYPES.includes(p.economic_default)"));
  assert.ok(!create.includes("b.economic_type"));
  assert.ok(!create.includes("b.contribution_type"));

  const updateStart=source.indexOf('if (action === "work/update")');
  const updateEnd=source.indexOf('if (action === "capabilities/list")');
  const update=source.slice(updateStart,updateEnd);
  assert.ok(update.includes("if (isManager)"));
  assert.ok(update.includes('"contribution_type" in b'));
  assert.ok(update.includes('"economic_type" in b'));
});

test("Capacity entries begin Pending Review and management controls productive credit",()=>{
  const start=source.indexOf('if (action === "capacity/create")');
  const update=source.indexOf('if (action === "capacity/update")');
  const create=source.slice(start,update);
  assert.ok(create.includes('review_status: "pending_review"'));
  assert.ok(create.includes("credit_class: creditClass"));
  assert.ok(create.includes("Technicians can only record their own capacity time."));

  const end=source.indexOf('if (action === "parts/create")');
  const block=source.slice(update,end);
  assert.ok(block.includes('status === "approved"'));
  assert.ok(block.includes("approved_by = u.id"));
  assert.ok(block.includes("approved_at = new Date().toISOString()"));
  assert.ok(block.includes("This capacity entry requires manager review."));
});

test("Productivity uses approved contribution and constraints to calculate opportunity",()=>{
  const start=source.indexOf('if (action === "productivity/summary")');
  const end=source.indexOf('if (action === "management/review-queue")');
  const block=source.slice(start,end);
  for(const text of [
    "approvedProjectEntries",
    "approvedCapacity",
    "productiveCreditHours",
    "customerProductionHours",
    "managementAllocatedNonCustomerHours",
    "customerProductionOpportunityHours",
    "constrainedHours",
    "totalUnaccountedHours",
    "overAccountedHours",
    "productive_utilization_percent",
    "billable_utilization_percent",
    "customer_production_opportunity_percent",
    "billable_conversion_percent",
  ]) assert.ok(block.includes(text),text);
  assert.ok(block.includes('x.review_status === "approved"'));
  assert.ok(block.includes('x.status === "approved"'));
});

test("Unaccounted time remains visible instead of being silently excused",()=>{
  const start=source.indexOf('if (action === "productivity/summary")');
  const end=source.indexOf('if (action === "management/review-queue")');
  const block=source.slice(start,end);
  assert.ok(block.includes("inferredUnaccountedHours"));
  assert.ok(block.includes("unaccounted_hours"));
  assert.ok(block.includes("unaccounted time remains visible instead of being excused"));
});

test("Review queue surfaces capacity entries before they affect approved credit",()=>{
  const start=source.indexOf('if (action === "management/review-queue")');
  const end=source.indexOf('if (action === "timeline/add")');
  const block=source.slice(start,end);
  assert.ok(block.includes('"hub_capacity_entries"'));
  assert.ok(block.includes("review_status=eq.pending_review"));
  assert.ok(block.includes("capacity_pending_review"));
  assert.ok(block.includes("capacity_pending_review_hours"));
  assert.ok(block.includes("does not approve work or capacity credit"));
});
