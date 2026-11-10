import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Shopmonkey handoff keeps verified remote mappings and durable sync receipts",()=>{
  const sql=read("supabase/review-sql/hub-shopmonkey-handoff-v1.sql");
  for(const text of [
    "create table if not exists public.hub_shopmonkey_project_links",
    "remote_order_id text not null",
    "create table if not exists public.hub_shopmonkey_service_links",
    "primary key (project_id, system)",
    "create table if not exists public.hub_shopmonkey_sync_runs",
    "status in ('started','partial','complete','failed')",
    "create table if not exists public.hub_shopmonkey_work_links",
    "work_entry_id uuid primary key references public.hub_work_entries",
    "remote_service_id text not null",
    "remote_labor_id text not null",
    "Proof that one canonical HUB work entry became one specific Shopmonkey labor line",
  ]) assert.ok(sql.includes(text),text);
});

test("Shopmonkey write client is server-only in scope and exposes only required fixed operations",()=>{
  const client=read("supabase/functions/socal-hub-workspace/shopmonkey.ts");
  assert.ok(client.includes('const API_ORIGIN="https://api.shopmonkey.cloud"'));
  assert.ok(client.includes('"/v3/order/"'));
  assert.ok(client.includes('"/service"'));
  assert.ok(client.includes('+"/labor"'));
  assert.ok(client.includes("async order(orderId:string)"));
  assert.ok(client.includes("async services(orderId:string)"));
  assert.ok(client.includes("async addService(orderId:string"));
  assert.ok(client.includes("async addLabor(orderId:string"));
  for(const dangerous of ["payment","DELETE","Create Order","/v3/customer/"])assert.ok(!client.includes(dangerous),dangerous);
});

test("Shopmonkey client sends bounded labor facts supported by the documented Order API",()=>{
  const client=read("supabase/functions/socal-hub-workspace/shopmonkey.ts");
  for(const text of [
    "hours:Math.round(hours*100)/100",
    "rateCents",
    "showHours:true",
    "showNote:true",
    "completed:true",
    "Shopmonkey labor creation did not return a labor ID",
    "labor response order ID does not match",
    "labor response service ID does not match",
  ]) assert.ok(client.includes(text),text);
});

test("Project/order linking is owner-only and verifies the remote order before saving",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "shopmonkey/link/verify")');
  const end=source.indexOf('if (action === "shopmonkey/preview")');
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/management\(m, true\)/);
  assert.ok(block.includes("shopmonkeyClient().order(remoteOrderId)"));
  assert.ok(block.includes("This Shopmonkey order is read-only"));
  assert.ok(block.includes("order number does not match this project reference"));
  assert.ok(block.includes('"hub_shopmonkey_project_links"'));
});

test("Shopmonkey preview is read-only and only stages approved Ready work with positive billable hours",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "shopmonkey/preview")');
  const end=source.indexOf('if (action === "shopmonkey/sync")');
  const block=source.slice(start,end);
  assert.match(block,/management\(m\)/);
  assert.ok(block.includes("status=eq.approved&invoice_state=eq.ready"));
  assert.ok(block.includes("entry.billable_hours != null"));
  assert.ok(block.includes("Number(entry.billable_hours) > 0"));
  assert.ok(block.includes("Preview only. No Shopmonkey service or labor has been created by this action."));
  assert.ok(!block.includes('method: "POST"'));
});

test("Shopmonkey sync is owner-only, idempotent, receipt-driven and fail-closed on partial writes",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "shopmonkey/sync")');
  const end=source.indexOf('if (action === "timeline/add")');
  const block=source.slice(start,end);
  assert.match(block,/management\(m, true\)/);
  for(const text of [
    "hub_shopmonkey_sync_runs",
    "payload_hash",
    'existingRun.status === "complete"',
    "HUB will not blindly repeat external writes",
    "Every selected work entry must be manager-approved, Ready for Invoice and have positive billable hours",
    "hub_shopmonkey_service_links",
    "client.addService",
    "client.addLabor",
    "hub_shopmonkey_work_links",
    'invoice_state: "synced"',
    'status: savedLinks.length ? "partial" : "failed"',
    "Reconcile the remote order before any retry",
  ]) assert.ok(block.includes(text),text);
});

test("Shopmonkey credential stays server-side and absent configuration fails closed",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes('Deno.env.get("SHOPMONKEY_API_TOKEN")'));
  assert.ok(source.includes("Shopmonkey write integration is not configured."));
  assert.ok(source.includes('if (action === "shopmonkey/status")'));
  assert.ok(!source.includes("NEXT_PUBLIC_SHOPMONKEY"));
  assert.ok(!source.includes("VITE_SHOPMONKEY"));
});


test("Owner can verify an existing Shopmonkey service for a HUB system to recover or reuse clean invoice sections",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const start=source.indexOf('if (action === "shopmonkey/service/link")');
  const end=source.indexOf('if (action === "shopmonkey/preview")');
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/management\(m, true\)/);
  assert.ok(block.includes("shopmonkeyClient().services(orderLink.remote_order_id)"));
  assert.ok(block.includes("That Shopmonkey service was not found on the linked order."));
  assert.ok(block.includes('"hub_shopmonkey_service_links"'));
  assert.ok(block.includes("remote_service_id: remoteServiceId"));
});
