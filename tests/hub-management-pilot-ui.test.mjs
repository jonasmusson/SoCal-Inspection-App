import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Management pilot has authenticated and public no-write review routes",()=>{
  const app=read("src/App.tsx");
  assert.ok(app.includes("HubManagementPilotPage"));
  assert.ok(app.includes("location.pathname === '/review/hub/manage'"));
  assert.ok(app.includes("<HubManagementPilotPage demoMode />"));
  assert.ok(app.includes('path="/hub/manage"'));
  assert.ok(app.includes("isManager || isOwner ? <HubManagementPilotPage />"));
});

test("Management pilot reads review queue and productivity without creating a second mutation path",()=>{
  const page=read("src/pages/HubManagementPilotPage.tsx");
  assert.ok(page.includes("management/review-queue"));
  assert.ok(page.includes("productivity/summary"));
  for(const forbidden of [
    "method: 'POST'",
    "work/update",
    "capacity/update",
    "task/update",
    "shopmonkey/sync",
  ]) assert.ok(!page.includes(forbidden),forbidden);
});

test("Management pilot keeps contribution and economics separate",()=>{
  const page=read("src/pages/HubManagementPilotPage.tsx");
  for(const text of [
    "Attendance",
    "Productive credit",
    "Customer production",
    "Billable",
    "Constrained",
    "Customer support",
    "Internal investment",
    "Shop / other productive",
    "Production opportunity",
    "Approved billable",
    "Productive util.",
    "Billable conversion",
    "Billable util.",
  ]) assert.ok(page.includes(text),text);
});

test("Demo illustrates full credit for management-allocated non-billable work",()=>{
  const page=read("src/pages/HubManagementPilotPage.tsx");
  assert.ok(page.includes("attendance_hours: 8"));
  assert.ok(page.includes("productive_credit_hours: 8"));
  assert.ok(page.includes("customer_production_hours: 2"));
  assert.ok(page.includes("customer_support_hours: 2.5"));
  assert.ok(page.includes("internal_investment_hours: 3"));
  assert.ok(page.includes("shop_operations_hours: 0.5"));
  assert.ok(page.includes("approved_billable_hours: 2"));
  assert.ok(page.includes("productive_utilization_percent: 100"));
  assert.ok(page.includes("does not label that technician 25% productive"));
});

test("Management pilot explicitly surfaces pending capacity review and work availability",()=>{
  const page=read("src/pages/HubManagementPilotPage.tsx");
  assert.ok(page.includes("Capacity review"));
  assert.ok(page.includes("capacity_pending_review"));
  assert.ok(page.includes("Ready / unassigned"));
  assert.ok(page.includes("unassigned_ready_hours"));
  assert.ok(page.includes("Blocked"));
  assert.ok(page.includes("Waiting"));
});

test("Dashboard guidance says diagnose the system before judging the person",()=>{
  const page=read("src/pages/HubManagementPilotPage.tsx");
  assert.ok(page.includes("Read the allocation before judging the output."));
  assert.ok(page.includes("The dashboard should diagnose the system before judging the person."));
  assert.ok(!page.toLowerCase().includes("technician score"));
});
