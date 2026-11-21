import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Clipboard apply schema preserves source photos, reviewed lines and canonical work-entry links",()=>{
  const sql=read("supabase/review-sql/hub-clipboard-apply-v1.sql");
  for(const text of [
    "create table if not exists public.hub_clipboard_intakes",
    "create table if not exists public.hub_clipboard_intake_media",
    "create table if not exists public.hub_clipboard_lines",
    "request_id uuid not null unique",
    "work_performed_raw",
    "invoice_description",
    "confidence",
    "work_entry_id uuid not null unique references public.hub_work_entries",
    "hub_clipboard_intakes_project_scope_fkey",
  ]) assert.ok(sql.includes(text),text);
});

test("Clipboard apply is idempotent and transactional through an operation receipt",()=>{
  const sql=read("supabase/review-sql/hub-clipboard-apply-v1.sql");
  for(const text of [
    "create or replace function public.hub_apply_clipboard_intake",
    "pg_advisory_xact_lock",
    "hub_operation_receipts",
    "'clipboard_apply'",
    "payload_hash",
    "Request conflict",
    "return rec.result",
  ]) assert.ok(sql.includes(text),text);
});

test("Reviewed clipboard work becomes approved HUB work and optionally Ready for Invoice",()=>{
  const sql=read("supabase/review-sql/hub-clipboard-apply-v1.sql");
  assert.ok(sql.includes("'approved'"));
  assert.ok(sql.includes("case when p_invoice_ready then 'ready' else 'not_ready' end"));
  assert.ok(sql.includes("Owner permission required to mark clipboard work ready for invoice"));
  assert.ok(sql.includes("Original clipboard: "));
  assert.ok(sql.includes("Clipboard review note: "));
});

test("Clipboard transaction RPC is not callable by normal browser roles",()=>{
  const sql=read("supabase/review-sql/hub-clipboard-apply-v1.sql");
  assert.match(sql,/revoke all on function public\.hub_apply_clipboard_intake[\s\S]*from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public\.hub_apply_clipboard_intake[\s\S]*to service_role/);
});

test("HUB API accepts dedicated Clipboard media and delegates apply to the RPC",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes('"Clipboard"'));
  assert.ok(source.includes('if (action === "clipboard/apply")'));
  assert.ok(source.includes('rpc("hub_apply_clipboard_intake"'));
  assert.ok(source.includes("p_invoice_ready: Boolean(b.invoice_ready)"));
  assert.ok(source.includes("Owner permission is required to mark clipboard work Ready for Invoice."));
  assert.ok(source.includes("if (len > 524288)"));
});

test("Applied clipboard history is management-only and source-traceable",()=>{
  const source=read("supabase/functions/socal-hub-workspace/index.ts");
  assert.ok(source.includes("clipboard_intakes"));
  const get=source.slice(source.indexOf('if (action === "clipboard/get")'),source.indexOf('if (action === "timeline/add")'));
  assert.match(get,/management\(m\)/);
  assert.ok(get.includes('"hub_clipboard_intake_media"'));
  assert.ok(get.includes('"hub_clipboard_lines"'));
  assert.ok(get.includes("Clipboard intake unavailable."));
});
