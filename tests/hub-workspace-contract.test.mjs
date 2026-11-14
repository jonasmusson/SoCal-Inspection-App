import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("HUB workspace source is version-controlled with explicit auth boundary",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  const config=read("supabase/config.toml");
  assert.ok(source.includes('const VERSION = "0.'));
  assert.match(source,/async function userFor\(req: Request\)/);
  assert.match(source,/Your session expired\. Please sign in again\./);
  assert.match(source,/memberFor/);
  assert.match(source,/vehicleFor/);
  assert.match(source,/projectFor/);
  assert.match(config,/\[functions\.socal-hub-workspace\][\s\S]*verify_jwt = false/);
});

test("HUB workspace exposes project work, inspections, media and team operations",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  for(const action of [
    'action === "snapshot"',
    'action === "project/create"',
    'action === "project/update"',
    'action === "work/create"',
    'action === "work/update"',
    'action === "inspection/start"',
    'action === "inspection/get"',
    'action === "inspection/item"',
    'action === "inspection/submit"',
    'action === "uploads/reserve"',
    'action === "uploads/finalize"',
    'action === "team/list"',
    'action === "team/approve"',
    'action === "team/assign"',
  ]) assert.ok(source.includes(action),action);
});

test("HUB work entries remain review-first before invoice state changes",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.match(source,/status: "pending_review"/);
  assert.match(source,/if \(isManager\)/);
  assert.match(source,/billable_hours/);
  assert.match(source,/invoice_state/);
  assert.match(source,/\["not_ready", "ready", "exported", "synced"\]/);
  assert.match(source,/Technicians can only record their own hours/);
});

test("HUB media keeps private originals and verified archive copies",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.match(source,/BUCKET = "hub-pilot-private"/);
  assert.match(source,/ARCHIVE = "hub-media-archive"/);
  assert.match(source,/Original image verification failed/);
  assert.match(source,/Archive verification pending/);
  assert.match(source,/expiresIn: 300/);
});
