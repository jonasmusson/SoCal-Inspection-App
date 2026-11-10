import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("supabase/functions/socal-hub-workspace/index.ts");

test("Dictated work drafting is text-input, review-first and configuration-aware",()=>{
  assert.ok(source.includes('if (action === "work/draft/status")'));
  assert.ok(source.includes('input:"transcript-text"'));
  assert.ok(source.includes('mode:"review-first"'));
  assert.ok(source.includes('if (action === "work/draft")'));
  assert.ok(source.includes("Dictate or type a work note first."));
  assert.ok(source.includes("review_required:true"));
  assert.ok(source.includes("saved:false"));
});

test("Voice work draft uses server-side Responses API structured output without storing the response",()=>{
  for(const text of [
    'Deno.env.get("OPENAI_API_KEY")',
    '"https://api.openai.com/v1/responses"',
    'model:"gpt-6-luna"',
    'store:false',
    'reasoning:{effort:"low"}',
    'text:{format:WORK_DRAFT_FORMAT}',
    'type:"json_schema"',
    'name:"socal_hub_work_draft"',
  ]) assert.ok(source.includes(text),text);
  assert.ok(!source.includes("VITE_OPENAI"));
  assert.ok(!source.includes("NEXT_PUBLIC_OPENAI"));
});

test("Draft prompt explicitly prohibits invented hours, parts and status",()=>{
  for(const text of [
    "Never invent labor hours, part numbers, findings, completed work, task status, parts, customer promises or billing decisions.",
    "If hours are not explicitly stated, actual_hours must be null.",
    "Only suggest done, blocked or waiting when the technician explicitly says",
    "Never invent a part number.",
    "warnings rather than guessing",
  ]) assert.ok(source.includes(text),text);
});

test("Structured draft validates system, hours, parts and task suggestions before returning",()=>{
  for(const text of [
    "function validateWorkDraft",
    "WORK_SYSTEMS.includes(system)",
    "AI returned invalid hours",
    '["no_change","done","blocked","waiting"]',
    "parts.length>10",
    "AI returned an invalid part quantity",
    "PART_REQUEST_URGENCY.includes(urgency)",
  ]) assert.ok(source.includes(text),text);
});

test("Work draft never mutates project work, tasks, parts, timecards or Shopmonkey",()=>{
  const start=source.indexOf('if (action === "work/draft")');
  const end=source.indexOf('if (action === "work-session/start")');
  const block=source.slice(start,end);
  assert.ok(block.includes("Draft only. Nothing was added to project work, task status, Parts Requests, Timecards or Shopmonkey."));
  for(const forbidden of [
    'db("hub_work_entries"',
    'db("hub_project_tasks"',
    'db("hub_parts_requests"',
    'db("hub_timecard_shifts"',
    "shopmonkeyClient()",
  ]) assert.ok(!block.includes(forbidden),forbidden);
});

test("AI failure preserves the transcript conceptually instead of claiming save success",()=>{
  const start=source.indexOf('if (action === "work/draft")');
  const end=source.indexOf('if (action === "work-session/start")');
  const block=source.slice(start,end);
  assert.ok(block.includes("Voice work drafting could not complete. Keep the transcript and retry."));
  assert.ok(block.includes("transcript,"));
});
